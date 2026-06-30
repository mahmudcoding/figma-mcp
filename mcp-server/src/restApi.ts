import { AppError, FIGMA_API_SCHEMA } from "@custom-figma-mcp/shared";
import type { OAuthService } from "./oauth.js";

type RestRequestPayload = {
  operationId?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path?: string;
  pathParams?: Record<string, string | number | boolean>;
  query?: Record<string, string | number | boolean | Array<string | number | boolean>>;
  body?: unknown;
  headers?: Record<string, string>;
  userId?: string;
};
type RestOperation = {
  methodName: string;
  httpMethod: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
};

export class RestApiService {
  public constructor(private readonly oauth: OAuthService) {}

  public async request(payload: RestRequestPayload): Promise<unknown> {
    const operations = FIGMA_API_SCHEMA.restApi.operations as RestOperation[];
    const operation = payload.operationId
      ? operations.find((item) => item.methodName === payload.operationId)
      : undefined;

    const method = payload.method ?? operation?.httpMethod;
    const path = payload.path ?? operation?.path;
    if (!method || !path) {
      throw new AppError("VALIDATION_ERROR", "Provide operationId or method plus path");
    }

    const accessToken = await this.oauth.getAccessToken(payload.userId);
    if (!accessToken) {
      throw new AppError("AUTHENTICATION_ERROR", "Figma OAuth is not connected. Open /auth/login first.");
    }

    const url = new URL(applyPathParams(path, payload.pathParams ?? {}), "https://api.figma.com");
    for (const [key, value] of Object.entries(payload.query ?? {})) {
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(payload.headers ?? {})
    };

    let body: string | undefined;
    if (payload.body !== undefined) {
      headers["content-type"] = headers["content-type"] ?? "application/json";
      body = JSON.stringify(payload.body);
    }

    const requestInit: RequestInit = { method, headers };
    if (body !== undefined) {
      requestInit.body = body;
    }
    const response = await fetch(url, requestInit);
    const responseText = await response.text();
    const parsedBody = parseBody(responseText);

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      operationId: operation?.methodName ?? null,
      method,
      path,
      url: url.toString(),
      headers: Object.fromEntries(response.headers.entries()),
      body: parsedBody
    };
  }
}

function applyPathParams(routePath: string, params: Record<string, string | number | boolean>): string {
  return routePath.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new AppError("VALIDATION_ERROR", `Missing path parameter ${key}`);
    }
    return encodeURIComponent(String(value));
  });
}

function parseBody(text: string): unknown {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
