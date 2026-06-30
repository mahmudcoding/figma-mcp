import {
  PROTOCOL_VERSION,
  type StructuredError,
  type PluginToServerMessage,
  type ServerToPluginMessage,
  toStructuredError
} from "./protocol.js";

interface PluginMetadata {
  protocolVersion: string;
  pluginId: string;
  fileKey?: string;
  fileName?: string;
  editorType?: string;
  currentPageId?: string;
  currentPageName?: string;
  selection?: Array<{ id: string; name: string; type: string }>;
}

interface ServerConfig {
  ok: boolean;
  serverName: string;
  websocketUrl: string;
  authToken: string;
  status?: {
    pluginConnected?: boolean;
    lastPluginHeartbeat?: string | null;
  };
}

interface PendingResult {
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: unknown;
}

type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "offline" | "paused";

const DEFAULT_CONFIG_URL = "http://localhost:3333/plugin/config";
const HEARTBEAT_INTERVAL_MS = 10_000;
const MAX_RECONNECT_DELAY_MS = 15_000;
const MAX_LOG_LINES = 80;
const LEGACY_CONFIG_URL = "http://127.0.0.1:3333/plugin/config";

const statusDotEl = document.querySelector<HTMLSpanElement>("#statusDot")!;
const statusTextEl = document.querySelector<HTMLDivElement>("#statusText")!;
const statusDetailEl = document.querySelector<HTMLDivElement>("#statusDetail")!;
const fileNameEl = document.querySelector<HTMLDivElement>("#fileName")!;
const pageNameEl = document.querySelector<HTMLDivElement>("#pageName")!;
const serverNameEl = document.querySelector<HTMLDivElement>("#serverName")!;
const heartbeatEl = document.querySelector<HTMLDivElement>("#heartbeat")!;
const reconnectButton = document.querySelector<HTMLButtonElement>("#reconnect")!;
const diagnosticsButton = document.querySelector<HTMLButtonElement>("#diagnosticsToggle")!;
const diagnosticsPanel = document.querySelector<HTMLDivElement>("#diagnosticsPanel")!;
const configUrlInput = document.querySelector<HTMLInputElement>("#configUrl")!;
const serverUrlInput = document.querySelector<HTMLInputElement>("#serverUrl")!;
const authTokenInput = document.querySelector<HTMLInputElement>("#authToken")!;
const pauseButton = document.querySelector<HTMLButtonElement>("#pause")!;
const logEl = document.querySelector<HTMLDivElement>("#log")!;

let socket: WebSocket | undefined;
let reconnectTimer: number | undefined;
let heartbeatTimer: number | undefined;
let reconnectAttempts = 0;
let connectionState: ConnectionState = "idle";
let manuallyPaused = false;
let config: ServerConfig | undefined;
let lastPongAt: Date | undefined;
let metadata: PluginMetadata = {
  protocolVersion: PROTOCOL_VERSION,
  pluginId: "custom-figma-mcp-bridge"
};
const outboundQueue: PendingResult[] = [];
const logs: string[] = [];

const storedConfigUrl = readStorage("configUrl");
configUrlInput.value =
  storedConfigUrl && storedConfigUrl !== LEGACY_CONFIG_URL ? storedConfigUrl : DEFAULT_CONFIG_URL;

reconnectButton.addEventListener("click", () => {
  manuallyPaused = false;
  reconnectAttempts = 0;
  void connectWithFreshConfig();
});

diagnosticsButton.addEventListener("click", () => {
  diagnosticsPanel.hidden = !diagnosticsPanel.hidden;
  diagnosticsButton.textContent = diagnosticsPanel.hidden ? "Diagnostics" : "Hide diagnostics";
});

pauseButton.addEventListener("click", () => {
  manuallyPaused = true;
  clearReconnectTimer();
  clearHeartbeatTimer();
  socket?.close(1000, "Paused by user");
  socket = undefined;
  setConnectionState("paused", "Connection paused. Use Reconnect when ready.");
});

configUrlInput.addEventListener("change", () => {
  writeStorage("configUrl", configUrlInput.value.trim() || DEFAULT_CONFIG_URL);
});

window.onmessage = (event: MessageEvent) => {
  const message = event.data.pluginMessage;
  if (!message) {
    return;
  }

  if (message.type === "PLUGIN_METADATA") {
    metadata = { ...metadata, ...message.payload };
    renderMetadata();
    return;
  }

  if (message.type === "COMMAND_RESULT") {
    queueOrSendResult({
      requestId: message.requestId,
      success: message.success,
      result: message.result,
      error: message.error
    });
  }
};

parent.postMessage({ pluginMessage: { type: "REQUEST_METADATA" } }, "*");
renderMetadata();
setConnectionState("connecting", "Looking for the local MCP server...");
void connectWithFreshConfig();

async function connectWithFreshConfig(): Promise<void> {
  clearReconnectTimer();
  const loaded = await loadServerConfig();
  if (!loaded) {
    scheduleReconnect("Local MCP server is not running. Start it with pnpm start, then reconnect.", "offline");
    return;
  }

  connect();
}

async function loadServerConfig(): Promise<boolean> {
  const configUrl = configUrlInput.value.trim() || DEFAULT_CONFIG_URL;
  writeStorage("configUrl", configUrl);

  try {
    const response = await fetch(configUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    config = (await response.json()) as ServerConfig;
    serverUrlInput.value = config.websocketUrl;
    authTokenInput.value = config.authToken;
    serverNameEl.textContent = config.serverName || "Local MCP";
    renderHeartbeat(config.status?.lastPluginHeartbeat ?? null);
    log("Loaded local MCP configuration");
    return true;
  } catch (error) {
    serverNameEl.textContent = "Local MCP unavailable";
    log(`Server configuration unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function connect(): void {
  const websocketUrl = serverUrlInput.value.trim() || config?.websocketUrl;
  const authToken = authTokenInput.value.trim() || config?.authToken;

  if (!websocketUrl || !authToken) {
    scheduleReconnect("Local MCP server is not ready. Reconnecting...");
    return;
  }

  manuallyPaused = false;
  clearHeartbeatTimer();
  socket?.close(1000, "Opening new connection");
  setConnectionState("connecting", "Connecting to the local MCP server...");
  log(`Connecting to ${websocketUrl}`);

  const nextSocket = new WebSocket(websocketUrl);
  socket = nextSocket;

  nextSocket.onopen = () => {
    reconnectAttempts = 0;
    lastPongAt = undefined;
    setConnectionState("connected", "Ready for Codex commands.");
    log("Connected to local MCP server");
    sendHello();
    flushQueue();
    heartbeatTimer = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    sendHeartbeat();
  };

  nextSocket.onmessage = (event) => {
    handleServerMessage(event.data);
  };

  nextSocket.onerror = () => {
    log("Connection problem detected. Waiting for reconnect.");
  };

  nextSocket.onclose = () => {
    if (socket !== nextSocket) {
      return;
    }
    clearHeartbeatTimer();
    socket = undefined;
    if (manuallyPaused) {
      setConnectionState("paused", "Connection paused. Use Reconnect when ready.");
      return;
    }
    scheduleReconnect("Connection lost. Reconnecting...");
  };
}

function scheduleReconnect(message: string, state: ConnectionState = "reconnecting"): void {
  if (reconnectTimer !== undefined) {
    return;
  }

  setConnectionState(state, message);
  const baseDelay = Math.min(1000 * 1.6 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
  const jitter = Math.floor(Math.random() * 250);
  const delay = Math.round(baseDelay + jitter);
  reconnectAttempts += 1;
  log(`Reconnect scheduled in ${delay}ms`);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    void connectWithFreshConfig();
  }, delay);
}

function handleServerMessage(raw: string): void {
  let message: ServerToPluginMessage;
  try {
    message = JSON.parse(raw) as ServerToPluginMessage;
  } catch (error) {
    log(`Ignored invalid server message: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  if (message.type === "PONG") {
    lastPongAt = new Date();
    renderHeartbeat(lastPongAt.toISOString());
    return;
  }

  parent.postMessage(
    {
      pluginMessage: {
        type: "EXECUTE_COMMAND",
        requestId: message.requestId,
        command: message.type,
        payload: "payload" in message ? message.payload : {}
      }
    },
    "*"
  );
}

function sendHello(): void {
  const payload: {
    protocolVersion: string;
    pluginId: string;
    fileKey?: string;
    fileName?: string;
    editorType?: string;
  } = {
    protocolVersion: PROTOCOL_VERSION,
    pluginId: "custom-figma-mcp-bridge"
  };
  if (metadata.fileKey) {
    payload.fileKey = metadata.fileKey;
  }
  if (metadata.fileName) {
    payload.fileName = metadata.fileName;
  }
  if (metadata.editorType) {
    payload.editorType = metadata.editorType;
  }

  send({
    type: "HELLO",
    requestId: createRequestId(),
    authToken: authTokenInput.value.trim(),
    payload
  } satisfies PluginToServerMessage);
}

function sendHeartbeat(): void {
  send({
    type: "PING",
    requestId: createRequestId(),
    authToken: authTokenInput.value.trim(),
    payload: { at: new Date().toISOString() }
  });
}

function queueOrSendResult(result: PendingResult): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    outboundQueue.push(result);
    while (outboundQueue.length > 100) {
      outboundQueue.shift();
    }
    return;
  }

  sendResult(result);
}

function flushQueue(): void {
  while (outboundQueue.length > 0) {
    const result = outboundQueue.shift();
    if (result) {
      sendResult(result);
    }
  }
}

function sendResult(result: PendingResult): void {
  if (result.success) {
    send({
      requestId: result.requestId,
      success: true,
      result: result.result
    });
  } else {
    send({
      requestId: result.requestId,
      success: false,
      error: isStructuredError(result.error)
        ? result.error
        : toStructuredError(result.error ?? new Error("Unknown plugin error"))
    });
  }
}

function send(message: PluginToServerMessage): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(message));
}

function setConnectionState(state: ConnectionState, detail: string): void {
  connectionState = state;
  statusDotEl.className = `status-dot ${state}`;
  statusTextEl.textContent =
    state === "connected"
      ? "Connected"
      : state === "connecting"
        ? "Connecting"
      : state === "paused"
        ? "Paused"
        : state === "offline"
          ? "Server offline"
          : "Reconnecting";
  statusDetailEl.textContent = detail;
}

function renderMetadata(): void {
  fileNameEl.textContent = metadata.fileName ?? "Open Figma file";
  pageNameEl.textContent = metadata.currentPageName ?? "Current page unavailable";
}

function renderHeartbeat(value: string | null): void {
  heartbeatEl.textContent = value ? `Last heartbeat: ${new Date(value).toLocaleTimeString()}` : "Last heartbeat: pending";
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== undefined) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
}

function clearHeartbeatTimer(): void {
  if (heartbeatTimer !== undefined) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }
}

function log(message: string): void {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  logs.unshift(line);
  while (logs.length > MAX_LOG_LINES) {
    logs.pop();
  }
  logEl.textContent = logs.join("\n");
}

function readStorage(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Figma may serve development plugin UI from a data: URL with storage disabled.
  }
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `plugin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isStructuredError(error: unknown): error is StructuredError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  );
}
