import type { LatLng } from "@/domain/geo";
import type { GeocodeResult } from "@/domain/geocoding";
import type { ProviderInfo } from "../core/types";

export interface GeocodeQuery {
  q: string;
  limit: number;
  /** Prioriza resultados cercanos a este punto (solo autocompletado). */
  near?: LatLng;
}

export interface GeocodeResponse {
  results: GeocodeResult[];
  /** Adaptador que respondió de verdad (puede ser el de respaldo). */
  providerId: string;
  fromCache: boolean;
}

export interface GeocodingProvider extends ProviderInfo {
  /** Sugerencias mientras se escribe. Nominatim lo prohíbe: solo Photon (o demo). */
  autocomplete(query: GeocodeQuery): Promise<GeocodeResponse>;
  /** Búsqueda completa (al enviar). Photon con Nominatim como respaldo. */
  search(query: GeocodeQuery): Promise<GeocodeResponse>;
}
