import type { ProvidersMode } from "./config";

export interface ProviderCandidates<T> {
  real: () => T;
  demo: () => T;
  /** Configuración que falta para usar el adaptador real (vacío = listo). */
  missingConfig: string[];
}

export interface ProviderSelection<T> {
  provider: T;
  isDemo: boolean;
  /** Motivo de usar demo, para mostrarlo en la UI. */
  notice?: string;
}

/**
 * Elige adaptador: `demo` fuerza fixtures; `auto` usa el real si está configurado y, si no,
 * cae a demo avisando de qué falta. Nunca se cambia a demo por un fallo en tiempo de ejecución:
 * ese caso se informa como error para no mezclar datos reales y de demostración sin avisar.
 */
export function selectProvider<T>(
  mode: ProvidersMode,
  candidates: ProviderCandidates<T>,
): ProviderSelection<T> {
  if (mode === "demo") {
    return {
      provider: candidates.demo(),
      isDemo: true,
      notice: "Modo demostración (PROVIDERS_MODE=demo): datos grabados, no en vivo.",
    };
  }
  if (candidates.missingConfig.length > 0) {
    return {
      provider: candidates.demo(),
      isDemo: true,
      notice: `Proveedor real sin configurar (falta ${candidates.missingConfig.join(", ")}): se muestran datos de demostración.`,
    };
  }
  return { provider: candidates.real(), isDemo: false };
}
