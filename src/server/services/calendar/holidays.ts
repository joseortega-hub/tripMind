import type { FeedStatus, Holiday } from "@/domain/calendar";
import type { GeocodeResult } from "@/domain/geocoding";
import { normalizeText } from "@/server/providers/core/osm";
import type { ProviderSelection } from "@/server/providers/core/registry";
import { ProviderError } from "@/server/providers/core/types";
import {
  type HolidaysProvider,
  HolidaysUnsupportedError,
  NAGER_URL,
} from "@/server/providers/holidays";

/**
 * Nombres de las subdivisiones ISO 3166-2 que usa Nager.Date, para saber si un festivo regional
 * es del destino a partir del texto del geocodificador ("Madrid, Comunidad de Madrid, España").
 * Solo España por ahora; en otros países los regionales quedan como "puede afectar".
 */
const REGION_NAMES: Record<string, string[]> = {
  "ES-AN": ["andalucia"],
  "ES-AR": ["aragon"],
  "ES-AS": ["asturias", "principado de asturias"],
  "ES-CB": ["cantabria"],
  "ES-CE": ["ceuta"],
  "ES-CL": ["castilla y leon"],
  "ES-CM": ["castilla-la mancha", "castilla la mancha"],
  "ES-CN": ["canarias"],
  "ES-CT": ["cataluna", "catalunya"],
  "ES-EX": ["extremadura"],
  "ES-GA": ["galicia"],
  "ES-IB": ["illes balears", "islas baleares"],
  "ES-MC": ["region de murcia", "murcia"],
  "ES-MD": ["comunidad de madrid"],
  "ES-ML": ["melilla"],
  "ES-NC": ["navarra", "comunidad foral de navarra"],
  "ES-PV": ["pais vasco", "euskadi"],
  "ES-RI": ["la rioja"],
  "ES-VC": ["comunidad valenciana", "comunitat valenciana"],
};

/** Región ISO 3166-2 del destino, si se reconoce en su etiqueta. */
export function destinationRegion(destination: GeocodeResult): string | undefined {
  const parts = destination.label.split(",").map((part) => normalizeText(part));
  for (const [code, names] of Object.entries(REGION_NAMES)) {
    if (!code.startsWith(`${destination.countryCode?.toUpperCase()}-`)) continue;
    if (parts.some((part) => names.includes(part))) return code;
  }
  return undefined;
}

export interface HolidaysResult {
  holidays: Holiday[];
  status: FeedStatus;
}

/** Festivos del destino en las fechas del viaje (nacionales y regionales, con su alcance). */
export async function holidaysForTrip(
  trip: { destination: GeocodeResult; startDate: string; endDate: string },
  selection: ProviderSelection<HolidaysProvider>,
): Promise<HolidaysResult> {
  const { provider } = selection;
  const country = trip.destination.countryCode?.toUpperCase();
  const base = { providerName: provider.name, isDemo: selection.isDemo };
  if (!country) {
    return {
      holidays: [],
      status: {
        ...base,
        status: "unsupported",
        message: "No se conoce el país del destino: no se pueden consultar sus festivos.",
      },
    };
  }
  const region = destinationRegion(trip.destination);
  const years = [
    ...new Set([Number(trip.startDate.slice(0, 4)), Number(trip.endDate.slice(0, 4))]),
  ];
  const holidays: Holiday[] = [];
  try {
    for (const year of years) {
      const { holidays: list, retrievedAt } = await provider.publicHolidays(year, country);
      for (const holiday of list) {
        if (holiday.date < trip.startDate || holiday.date > trip.endDate) continue;
        const regions = holiday.counties ?? [];
        const national = holiday.global || regions.length === 0;
        holidays.push({
          date: holiday.date,
          name: holiday.name,
          localName: holiday.localName,
          regions: national ? [] : regions,
          appliesToDestination: national
            ? "yes"
            : region
              ? regions.includes(region)
                ? "yes"
                : "no"
              : "maybe",
          types: holiday.types,
          source: {
            name: "Nager.Date",
            url: `${NAGER_URL}/PublicHoliday/Country/${country}`,
            retrievedAt,
            license: "MIT",
          },
          isDemo: selection.isDemo,
        });
      }
    }
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    console.warn("[calendar] festivos:", error.message);
    return {
      holidays: [],
      status: {
        ...base,
        status: error instanceof HolidaysUnsupportedError ? "unsupported" : "unavailable",
        message:
          error instanceof HolidaysUnsupportedError
            ? error.message
            : "No se han podido consultar los festivos ahora mismo.",
        externalUrl: `${NAGER_URL}/PublicHoliday/Country/${country}`,
      },
    };
  }
  return {
    holidays: holidays.filter((holiday) => holiday.appliesToDestination !== "no"),
    status: {
      ...base,
      status: "ok",
      message: region
        ? "Nacionales y regionales. Las fiestas locales del municipio pueden faltar: consúltalas en su web oficial."
        : "Nacionales; los regionales se marcan como «puede afectar» porque no se reconoce la región del destino. Las fiestas locales pueden faltar.",
    },
  };
}

/**
 * Festivos por día para evaluar `opening_hours`: "confirmed" (nacional o de la región) o
 * "possible" (regional de una región que no se ha podido confirmar).
 */
export function holidayMap(holidays: readonly Holiday[]): Map<string, "confirmed" | "possible"> {
  const map = new Map<string, "confirmed" | "possible">();
  for (const holiday of holidays) {
    if (holiday.appliesToDestination === "yes") map.set(holiday.date, "confirmed");
    else if (holiday.appliesToDestination === "maybe" && !map.has(holiday.date)) {
      map.set(holiday.date, "possible");
    }
  }
  return map;
}
