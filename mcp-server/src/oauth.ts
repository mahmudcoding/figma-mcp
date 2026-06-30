import crypto from "node:crypto";
import type { AppConfig } from "./config.js";
import { TokenCrypto } from "./crypto.js";
import type { TokenRepository, UserRepository } from "./db/repositories.js";
import { AppError, FIGMA_API_SCHEMA } from "@custom-figma-mcp/shared";

interface FigmaTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface FigmaMeResponse {
  email: string;
}

export class OAuthService {
  private readonly stateStore = new Set<string>();

  public constructor(
    private readonly config: AppConfig,
    private readonly users: UserRepository,
    private readonly tokens: TokenRepository,
    private readonly tokenCrypto: TokenCrypto
  ) {}

  public createLoginUrl(): string {
    const credentials = this.requireOAuthCredentials();
    const state = crypto.randomBytes(24).toString("base64url");
    this.stateStore.add(state);
    const url = new URL("https://www.figma.com/oauth");
    url.searchParams.set("client_id", credentials.clientId);
    url.searchParams.set("redirect_uri", this.config.oauthRedirectUri);
    url.searchParams.set("scope", FIGMA_API_SCHEMA.oauthScopes.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    return url.toString();
  }

  public async handleCallback(code: string, state: string): Promise<{ userId: string; email: string }> {
    if (!this.stateStore.delete(state)) {
      throw new Error("Invalid OAuth state");
    }

    const token = await this.exchangeCode(code);
    const me = await this.fetchMe(token.access_token);
    const user = this.users.upsertByEmail(me.email);
    this.tokens.save({
      user_id: user.id,
      encrypted_access_token: this.tokenCrypto.encrypt(token.access_token),
      encrypted_refresh_token: this.tokenCrypto.encrypt(requireRefreshToken(token)),
      expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString()
    });

    return { userId: user.id, email: user.email };
  }

  public async getAccessToken(userId?: string): Promise<string | undefined> {
    const user = userId ? undefined : this.users.first();
    const tokenRecord = this.tokens.findByUserId(userId ?? user?.id ?? "");
    if (!tokenRecord) {
      return undefined;
    }

    const expiresAt = Date.parse(tokenRecord.expires_at);
    if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000) {
      return this.tokenCrypto.decrypt(tokenRecord.encrypted_access_token);
    }

    const refreshed = await this.refreshToken(this.tokenCrypto.decrypt(tokenRecord.encrypted_refresh_token));
    this.tokens.save({
      user_id: tokenRecord.user_id,
      encrypted_access_token: this.tokenCrypto.encrypt(refreshed.access_token),
      encrypted_refresh_token: this.tokenCrypto.encrypt(refreshed.refresh_token ?? this.tokenCrypto.decrypt(tokenRecord.encrypted_refresh_token)),
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    });
    return refreshed.access_token;
  }

  private async exchangeCode(code: string): Promise<FigmaTokenResponse> {
    const credentials = this.requireOAuthCredentials();
    const body = new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: this.config.oauthRedirectUri,
      code,
      grant_type: "authorization_code"
    });

    return this.postToken(body);
  }

  private async refreshToken(refreshToken: string): Promise<FigmaTokenResponse> {
    this.requireOAuthCredentials();
    const body = new URLSearchParams({
      refresh_token: refreshToken
    });

    return this.postToken(body, "https://api.figma.com/v1/oauth/refresh", true);
  }

  private async postToken(
    body: URLSearchParams,
    url = "https://api.figma.com/v1/oauth/token",
    basicAuth = false
  ): Promise<FigmaTokenResponse> {
    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded"
    };
    if (basicAuth) {
      const credentials = this.requireOAuthCredentials();
      headers.authorization = `Basic ${Buffer.from(
        `${credentials.clientId}:${credentials.clientSecret}`
      ).toString("base64")}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body
    });

    if (!response.ok) {
      throw new Error(`Figma token request failed: ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as FigmaTokenResponse;
  }

  private async fetchMe(accessToken: string): Promise<FigmaMeResponse> {
    const response = await fetch("https://api.figma.com/v1/me", {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Figma user request failed: ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as FigmaMeResponse;
  }

  private requireOAuthCredentials(): { clientId: string; clientSecret: string } {
    if (!this.config.figmaClientId || !this.config.figmaClientSecret) {
      throw new AppError(
        "AUTHENTICATION_ERROR",
        "Figma OAuth credentials are not configured. Set FIGMA_CLIENT_ID and FIGMA_CLIENT_SECRET for REST-only features."
      );
    }

    return {
      clientId: this.config.figmaClientId,
      clientSecret: this.config.figmaClientSecret
    };
  }
}

function requireRefreshToken(token: FigmaTokenResponse): string {
  if (!token.refresh_token) {
    throw new Error("Figma OAuth response did not include a refresh token");
  }
  return token.refresh_token;
}
