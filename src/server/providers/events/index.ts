import { z } from "zod";
import type { TripEvent } from "@/domain/calendar";
import type { LatLng } from "@/domain/geo";
import { env } from "@/lib/env";
import { type CacheStore, cached, cacheKey } from "../core/cache";
import { getCacheStore } from "../core/cache-store";
import { getProvidersConfig } from "../core/config";
import { type FetchLike, fetchJson, parseProviderResponse, userAgent } from "../core/http";
import type { ProviderInfo } from "../core/types";
import { TripEventSchema } from "@/domain/calendar";

export interface EventsQuery {
  at: LatLng;
  radiusKm: number;
  /** Primer y último día (incluidos), en hora local del destino. */
  startDate: string;
  endDate: string;
}

export interface EventsProvider extends ProviderInfo {
  configured: boolean;
  /** Motivo de no estar configurado, para la UI. */
  message?: string;
  search(query: EventsQuery): Promise<TripEvent[]>;
}

export const TICKETMASTER_NAME = "Ticketmaster Discovery API";

const ImageSchema = z.object({
  url: z.string(),
  ratio: z.string().optional(),
  width: z.number().optional(),
});
const TmEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().optional(),
  dates: z.object({
    start: z.object({
      localDate: z.iso.date().optional(),
      localTime: z.string().optional(),
    }),
    status: z.object({ code: z.string().optional() }).optional(),
  }),
  classifications: z
    .array(
      z.object({
        segment: z.object({ name: z.string() }).optional(),
        genre: z.object({ name: z.string() }).optional(),
      }),
    )
    .optional(),
  images: z.array(ImageSchema).optional(),
  _embedded: z
    .object({
      venues: z
        .array(
          z.object({
            name: z.string().optional(),
            city: z.object({ name: z.string() }).optional(),
            location: z.object({ latitude: z.string(), longitude: z.string() }).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});
export const TicketmasterResponseSchema = z.object({
  _embedded: z.object({ events: z.array(TmEventSchema) }).optional(),
});
export type TicketmasterResponse = z.infer<typeof TicketmasterResponseSchema>;

const TM_UNDEFINED = new Set(["Undefined", "Other"]);

export function ticketmasterUrl(query: EventsQuery, apiKey: string) {
  const params = new URLSearchParams({
    apikey: apiKey,
    latlong: `${query.at.lat.toFixed(4)},${query.at.lng.toFixed(4)}`,
    radius: String(query.radiusKm),
    unit: "km",
    // Ticketmaster filtra en UTC: se amplía un día por cada lado y se recorta por fecha local.
    startDateTime: `${shiftDate(query.startDate, -1)}T00:00:00Z`,
    endDateTime: `${shiftDate(query.endDate, 1)}T23:59:59Z`,
    size: "100",
    sort: "date,asc",
    locale: "*",
  });
  return `https://app.ticketmaster.com/discovery/v2/events.json?${params}`;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Respuesta → eventos con fecha local dentro del viaje. Sin fecha o sin enlace no se muestran. */
export function mapTicketmaster(
  response: TicketmasterResponse,
  query: EventsQuery,
  meta: { retrievedAt: string; isDemo: boolean },
): TripEvent[] {
  const events: TripEvent[] = [];
  for (const event of response._embedded?.events ?? []) {
    const date = event.dates.start.localDate;
    if (!date || date < query.startDate || date > query.endDate || !event.url) continue;
    const venue = event._embedded?.venues?.[0];
    const lat = Number(venue?.location?.latitude);
    const lng = Number(venue?.location?.longitude);
    const classification = event.classifications?.[0];
    const named = (value?: string) => (value && !TM_UNDEFINED.has(value) ? value : undefined);
    const image = (event.images ?? [])
      .filter((img) => img.ratio === "16_9")
      .sort((a, b) => Math.abs((a.width ?? 0) - 640) - Math.abs((b.width ?? 0) - 640))[0];
    const parsed = TripEventSchema.safeParse({
      id: `ticketmaster:${event.id}`,
      name: event.name,
      date,
      time: event.dates.start.localTime?.slice(0, 5),
      url: event.url,
      category: named(classification?.segment?.name),
      genre: named(classification?.genre?.name),
      status: event.dates.status?.code,
      venue: venue?.name
        ? {
            name: venue.name,
            city: venue.city?.name,
            location: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined,
          }
        : undefined,
      imageUrl: image?.url,
      source: {
        name: TICKETMASTER_NAME,
        url: event.url,
        retrievedAt: meta.retrievedAt,
        attribution: "Datos de eventos de Ticketmaster",
      },
      isDemo: meta.isDemo,
    });
    if (parsed.success) events.push(parsed.data);
  }
  return events;
}

const HOUR = 60 * 60 * 1000;

export function createTicketmasterProvider(deps: {
  apiKey: string;
  userAgent: string;
  cache: CacheStore;
  fetch?: FetchLike;
}): EventsProvider {
  return {
    id: "ticketmaster",
    name: TICKETMASTER_NAME,
    isDemo: false,
    configured: true,
    async search(query) {
      const { value } = await cached(
        deps.cache,
        {
          key: cacheKey("ticketmaster", query),
          provider: "ticketmaster",
          // La cartelera cambia (cancelaciones, nuevas fechas): 6 horas.
          ttlMs: 6 * HOUR,
          schema: z.array(TripEventSchema),
        },
        async () => {
          const raw = await fetchJson(ticketmasterUrl(query, deps.apiKey), {
            providerId: "ticketmaster",
            userAgent: deps.userAgent,
            fetch: deps.fetch,
          });
          return mapTicketmaster(
            parseProviderResponse(TicketmasterResponseSchema, raw, "ticketmaster"),
            query,
            { retrievedAt: new Date().toISOString(), isDemo: false },
          );
        },
      );
      return value;
    },
  };
}

/**
 * Sin clave no hay eventos: no se graban fixtures de Ticketmaster (exige clave) ni se inventan.
 * La UI muestra categorías para investigar por cuenta propia.
 */
export function createNotConfiguredEventsProvider(message: string): EventsProvider {
  return {
    id: "events-not-configured",
    name: TICKETMASTER_NAME,
    isDemo: false,
    configured: false,
    message,
    async search() {
      return [];
    },
  };
}

export function getEventsProvider(): EventsProvider {
  const config = getProvidersConfig();
  if (config.mode === "demo") {
    return createNotConfiguredEventsProvider(
      "Modo demostración: no hay eventos grabados (Ticketmaster exige clave).",
    );
  }
  const apiKey = env.TICKETMASTER_API_KEY?.trim();
  if (!apiKey) {
    return createNotConfiguredEventsProvider(
      "Eventos sin configurar (falta TICKETMASTER_API_KEY).",
    );
  }
  return createTicketmasterProvider({
    apiKey,
    userAgent: userAgent(config.contactEmail),
    cache: getCacheStore(),
  });
}
