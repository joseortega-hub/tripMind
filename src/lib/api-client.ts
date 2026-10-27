/** Error de una ruta `/api/*` con el formato `{ error: { code, message, externalUrl? } }`. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly externalUrl?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ProviderMeta {
  id: string;
  name: string;
  isDemo: boolean;
  notice?: string;
}

async function parse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => undefined)) as
    { error?: { code?: string; message?: string; externalUrl?: string } } | undefined;
  if (!response.ok) {
    throw new ApiError(
      body?.error?.message ?? "No se ha podido completar la petición.",
      response.status,
      body?.error?.code,
      body?.error?.externalUrl,
    );
  }
  return body as T;
}

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("Sin conexión con el servidor. Revisa tu conexión.", 0, "network");
  }
  return parse<T>(response);
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  return sendJson<T>(url, "POST", body);
}

export async function sendJson<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Sin conexión con el servidor. Revisa tu conexión.", 0, "network");
  }
  return parse<T>(response);
}
