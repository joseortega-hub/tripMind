/** Identidad de un adaptador concreto (real o demo). Se devuelve al cliente junto a los datos. */
export interface ProviderInfo {
  /** Identificador técnico, p. ej. "photon", "overpass", "demo-geocoding". */
  id: string;
  /** Nombre legible para la UI. */
  name: string;
  isDemo: boolean;
}

/** Fallo de un proveedor externo. La UI lo muestra y ofrece `externalUrl` como alternativa. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly providerId: string,
    readonly options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ProviderError";
  }
}

/** Petición rechazada antes de llamar al proveedor (p. ej. bbox demasiado grande). */
export class ProviderInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderInputError";
  }
}
