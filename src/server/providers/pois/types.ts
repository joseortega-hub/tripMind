import type { BBox } from "@/domain/geo";
import type { Place, PlaceCategory } from "@/domain/place";
import type { ProviderInfo } from "../core/types";

export interface PlacesQuery {
  bbox: BBox;
  categories: PlaceCategory[];
  limit: number;
}

export interface PlacesResponse {
  places: Place[];
  fromCache: boolean;
  /** Avisos no bloqueantes, p. ej. "no se pudieron cargar las fotos de Wikimedia". */
  warnings: string[];
}

export interface PlacesProvider extends ProviderInfo {
  searchByBBox(query: PlacesQuery): Promise<PlacesResponse>;
}

/** Área máxima de bbox (grados²) para no lanzar consultas enormes a Overpass (~4×4 km en Madrid). */
export const MAX_BBOX_AREA = 0.0016;
