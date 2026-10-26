import { ProviderError } from "./types";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const REPO_URL = "https://github.com/joseortega-hub/tripmind";

/** User-Agent identificable con contacto, como piden las políticas de OSM y Wikimedia. */
export function userAgent(contactEmail?: string): string {
  return `TripMind/0.1 (+${REPO_URL}${contactEmail ? `; ${contactEmail}` : ""})`;
}

export interface HttpOptions {
  providerId: string;
  userAgent: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  method?: "GET" | "POST";
  /** Cuerpo `application/x-www-form-urlencoded` (Overpass). */
  form?: Record<string, string>;
}

/** Petición JSON con timeout. Cualquier fallo de red o estado no 2xx se convierte en ProviderError. */
export async function fetchJson(url: string, options: HttpOptions): Promise<unknown> {
  const doFetch = options.fetch ?? fetch;
  const headers: Record<string, string> = {
    "User-Agent": options.userAgent,
    Accept: "application/json",
  };
  let body: string | undefined;
  if (options.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(options.form).toString();
  }

  let response: Response;
  try {
    response = await doFetch(url, {
      method: options.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch (cause) {
    throw new ProviderError(`No se pudo contactar con ${options.providerId}`, options.providerId, {
      cause,
    });
  }
  if (!response.ok) {
    throw new ProviderError(
      `${options.providerId} respondió con estado ${response.status}`,
      options.providerId,
      { status: response.status },
    );
  }
  try {
    return await response.json();
  } catch (cause) {
    throw new ProviderError(`Respuesta no válida de ${options.providerId}`, options.providerId, {
      cause,
    });
  }
}
