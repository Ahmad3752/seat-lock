const API_URL = import.meta.env.VITE_API_URL ?? "/api/v1";

export class ApiError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

interface ApiEnvelope<T> { data: T; }

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (response.status === 204) return undefined as T;

  const body = await response.json() as ApiEnvelope<T> | { error: { code: string; message: string; details?: unknown } };
  if (!response.ok || "error" in body) {
    const error = "error" in body ? body.error : { code: "REQUEST_FAILED", message: "Request failed." };
    throw new ApiError(error.code, error.message, error.details);
  }
  return body.data;
}
