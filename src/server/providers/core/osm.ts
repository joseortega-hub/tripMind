import type { Source } from "@/domain/source";

export type OsmType = "node" | "way" | "relation";

const SHORT_TYPES: Record<string, OsmType> = { N: "node", W: "way", R: "relation" };

/** Acepta "N"/"W"/"R" (Photon) o "node"/"way"/"relation" (Nominatim, Overpass). */
export function toOsmType(value: string): OsmType | undefined {
  if (value === "node" || value === "way" || value === "relation") return value;
  return SHORT_TYPES[value];
}

export const osmId = (type: OsmType, id: number) => `osm:${type}/${id}`;

export const osmUrl = (type: OsmType, id: number) => `https://www.openstreetmap.org/${type}/${id}`;

export const OSM_LICENSE = "ODbL 1.0";
export const OSM_ATTRIBUTION = "© colaboradores de OpenStreetMap";

export function osmSource(name: string, type: OsmType, id: number, retrievedAt: string): Source {
  return {
    name,
    url: osmUrl(type, id),
    retrievedAt,
    license: OSM_LICENSE,
    attribution: OSM_ATTRIBUTION,
  };
}

/** Normaliza para comparar textos sin mayúsculas ni tildes. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
