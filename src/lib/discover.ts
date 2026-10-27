import type { Place, PlaceCategory } from "@/domain/place";
import type { Preferences } from "@/domain/preferences";
import { hasApplicableInterests, placeScore } from "@/server/services/itinerary/profile";

export const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export interface DiscoverGroup {
  key: "markets" | "viewpoints" | "lesser_known" | "stages";
  title: string;
  description: string;
  places: Place[];
}

const LESSER_KNOWN: readonly PlaceCategory[] = [
  "museum",
  "gallery",
  "monument",
  "attraction",
  "park",
  "place_of_worship",
];

/**
 * "Descubre algo diferente" (REQUISITOS §13) con los lugares reales del destino (OSM): mercados,
 * miradores, salas y lugares menos conocidos (sin artículo en Wikipedia, pero con alguna señal de
 * la fuente: Wikidata, foto, web u horario). No se inventa nada: solo se agrupa.
 */
export function discoverGroups(places: readonly Place[]): DiscoverGroup[] {
  const byName = (a: Place, b: Place) => a.name.localeCompare(b.name, "es");
  const groups: DiscoverGroup[] = [
    {
      key: "markets",
      title: "Mercados",
      description: "Mercados de abastos y de comida según OpenStreetMap.",
      places: places.filter((p) => p.category === "marketplace").sort(byName),
    },
    {
      key: "viewpoints",
      title: "Miradores",
      description: "Puntos marcados como mirador en OpenStreetMap.",
      places: places.filter((p) => p.category === "viewpoint").sort(byName),
    },
    {
      key: "lesser_known",
      title: "Menos conocidos",
      description:
        "Sin artículo en Wikipedia, pero con ficha en Wikidata, foto, web u horario publicados.",
      places: places
        .filter(
          (p) =>
            LESSER_KNOWN.includes(p.category) &&
            !p.wikipedia &&
            Boolean(p.wikidataId || p.image || p.website || p.openingHours),
        )
        .sort(byName),
    },
    {
      key: "stages",
      title: "Teatros y salas",
      description: "Para conciertos, teatro o exposiciones: consulta su cartelera en su web.",
      places: places.filter((p) => p.category === "theatre").sort(byName),
    },
  ];
  return groups.filter((group) => group.places.length > 0);
}

/** Categorías para investigar eventos por cuenta propia cuando no hay proveedor de eventos. */
export const RESEARCH_CATEGORIES = [
  "Conciertos",
  "Exposiciones",
  "Teatro",
  "Fiestas populares",
  "Mercadillos",
  "Deportes",
  "Vida nocturna",
  "Gastronomía",
  "Aire libre",
] as const;

const monthFormat = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Búsqueda web (enlace de búsqueda, no un dato) de una categoría en el destino y el mes del viaje. */
export function researchUrl(category: string, city: string, date: string) {
  const month = monthFormat.format(new Date(`${date}T00:00:00Z`));
  return `https://www.google.com/search?${new URLSearchParams({ q: `${category} ${city} ${month}` })}`;
}

export interface HeatPoint {
  place: Place;
  /** Puntuación interna de TripMind (intereses + señales de la fuente), no una valoración. */
  score: number;
}

/** Oportunidades según las preferencias del viaje (mapa de calor, §14B): puntuación interna. */
export function opportunityPoints(places: readonly Place[], preferences: Preferences): HeatPoint[] {
  const applicable = hasApplicableInterests(preferences);
  return places
    .map((place) => ({ place, score: placeScore(place, preferences, applicable) }))
    .filter((point) => point.score > 0)
    .sort((a, b) => b.score - a.score);
}
