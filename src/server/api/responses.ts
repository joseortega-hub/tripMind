import { z } from "zod";
import type { ProviderSelection } from "@/server/providers/core/registry";
import {
  ProviderError,
  ProviderInputError,
  type ProviderInfo,
} from "@/server/providers/core/types";

/** Metadatos del proveedor que acompañan a toda respuesta, para que la UI muestre la fuente. */
export function providerMeta(selection: ProviderSelection<ProviderInfo>, providerId?: string) {
  return {
    id: providerId ?? selection.provider.id,
    name: selection.provider.name,
    isDemo: selection.isDemo,
    notice: selection.notice,
  };
}

export function invalidRequest(error: z.ZodError) {
  return Response.json(
    {
      error: {
        code: "invalid_request",
        message: "Parámetros no válidos",
        issues: z.flattenError(error).fieldErrors,
      },
    },
    { status: 400 },
  );
}

/**
 * Traduce errores de proveedor a respuestas HTTP. Si el proveedor falla se indica y se ofrece un
 * enlace externo (REQUISITOS §3.8); nunca se rellenan datos de demostración en su lugar.
 */
export function providerFailure(error: unknown, externalUrl: string) {
  if (error instanceof ProviderInputError) {
    return Response.json(
      { error: { code: "invalid_request", message: error.message } },
      { status: 400 },
    );
  }
  if (error instanceof ProviderError) {
    console.warn(`[api] ${error.providerId}:`, error.message);
    return Response.json(
      {
        error: {
          code: "provider_unavailable",
          message: "El proveedor de datos no está disponible ahora mismo.",
          provider: error.providerId,
          externalUrl,
        },
      },
      { status: 502 },
    );
  }
  throw error;
}
