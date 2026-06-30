export type ErrorCode =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "PLUGIN_DISCONNECTED"
  | "PLUGIN_TIMEOUT"
  | "PLUGIN_ERROR"
  | "NODE_NOT_FOUND"
  | "UNSUPPORTED_OPERATION"
  | "INTERNAL_ERROR";

export interface StructuredError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  public constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }

  public toJSON(): StructuredError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details === undefined ? {} : { details: this.details })
    };
  }
}

export function toStructuredError(error: unknown): StructuredError {
  if (error instanceof AppError) {
    return error.toJSON();
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL_ERROR",
      message: error.message,
      details: error.stack
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "Unknown error",
    details: error
  };
}
