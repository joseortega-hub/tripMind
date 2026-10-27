import { type BBox, bboxContains } from "@/domain/geo";
import type { Place } from "@/domain/place";
import commonsFixture from "./fixtures/commons.json";
import overpassFixture from "./fixtures/overpass.json";
import stopsFixture from "./fixtures/stops.json";
import wikidataFixture from "./fixtures/wikidata.json";
import { mapOverpassResponse, OverpassResponseSchema } from "./overpass";
import { assertBBoxSize } from "./real";
import type { PlacesProvider } from "./types";
import {
  applyEnrichment,
  CommonsImageInfoSchema,
  type Enrichment,
  parseCommonsImageInfo,
  parseWikidataEntities,
  WikidataEntitiesSchema,
} from "./wikidata";

/** Zona cubierta por los datos grabados (Madrid centro: Prado, Letras, Atocha). */
export const DEMO_BBOX = overpassFixture.bbox as BBox;

export const DEMO_COVERAGE_WARNING =
  "Los datos de demostración solo cubren Madrid centro (Paseo del Prado, Barrio de las Letras y Atocha).";

function loadPlaces(): Place[] {
  const places = mapOverpassResponse(OverpassResponseSchema.parse(overpassFixture.response), {
    retrievedAt: overpassFixture.recordedAt,
    isDemo: true,
  });
  // Estaciones y paradas (capa 4) grabadas aparte en una zona algo más amplia (Fase 4).
  const known = new Set(places.map((place) => place.id));
  const stops = mapOverpassResponse(OverpassResponseSchema.parse(stopsFixture.response), {
    retrievedAt: stopsFixture.recordedAt,
    isDemo: true,
  });
  places.push(...stops.filter((stop) => stop.layer === "transport" && !known.has(stop.id)));
  const enrichment: Enrichment = { retrievedAt: wikidataFixture.recordedAt, facts: {}, images: {} };
  for (const entry of wikidataFixture.entries) {
    Object.assign(
      enrichment.facts,
      parseWikidataEntities(WikidataEntitiesSchema.parse(entry.response)),
    );
  }
  for (const entry of commonsFixture.entries) {
    Object.assign(
      enrichment.images,
      parseCommonsImageInfo(CommonsImageInfoSchema.parse(entry.response)),
    );
  }
  return applyEnrichment(places, enrichment);
}

let places: Place[] | undefined;

const intersects = ([w1, s1, e1, n1]: BBox, [w2, s2, e2, n2]: BBox) =>
  w1 <= e2 && e1 >= w2 && s1 <= n2 && n1 >= s2;

export function createDemoPlacesProvider(): PlacesProvider {
  return {
    id: "demo-places",
    name: "Demostración (respuestas grabadas de Overpass/Wikidata)",
    isDemo: true,
    async searchByBBox(query) {
      assertBBoxSize(query);
      places ??= loadPlaces();
      const results = places
        .filter(
          (p) => query.categories.includes(p.category) && bboxContains(query.bbox, p.location),
        )
        .slice(0, query.limit);
      const warnings = intersects(query.bbox, DEMO_BBOX) ? [] : [DEMO_COVERAGE_WARNING];
      return { places: results, fromCache: false, warnings };
    },
  };
}
