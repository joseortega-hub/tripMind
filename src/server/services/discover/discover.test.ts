import { describe, expect, it } from "vitest";
import type { Place } from "@/domain/place";
import { TripSchema, type Trip } from "@/domain/trip";
import { MemoryCacheStore } from "@/server/providers/core/cache";
import {
  createNotConfiguredEventsProvider,
  createTicketmasterProvider,
  mapTicketmaster,
} from "@/server/providers/events";
import { getHolidaysProvider } from "@/server/providers/holidays";
import { articleFromTag, getPageviewsProvider } from "@/server/providers/pageviews";
import { getPlacesProvider } from "@/server/providers/pois";
import { getRoutingProvider } from "@/server/providers/routing";
import { DEMO_ROUTING_HOTEL } from "@/server/providers/routing/demo";
import {
  createSocialEmbedProvider,
  mapTikTokOEmbed,
  parseSocialLink,
} from "@/server/providers/social";
import { getWeatherProvider } from "@/server/providers/weather";
import { buildCalendar } from "../calendar";
import { destinationRegion, holidayMap, holidaysForTrip } from "../calendar/holidays";
import { computeItinerary } from "../itinerary";
import { dayOpening } from "../itinerary/opening";
import { freeTime } from "./free-time";
import { popularityFrom, popularPlaces } from "./popular";
import { rainAlternatives } from "./rain";
import { detectPlaces } from "./social";

const source = { name: "Prueba", retrievedAt: "2026-10-27T10:00:00.000Z" };
const demo = { mode: "demo" as const };

function madridTrip(
  startDate: string,
  endDate: string,
  label = "Madrid, Comunidad de Madrid, España",
): Trip {
  return TripSchema.parse({
    id: "trip1234567890abcdefghij",
    destination: {
      id: "osm:relation/5326784",
      name: "Madrid",
      label,
      kind: "city",
      location: { lat: 40.4125, lng: -3.6945 },
      countryCode: "ES",
      source,
      isDemo: true,
    },
    startDate,
    endDate,
    travelers: { adults: 2 },
    hotel: {
      id: "hotel",
      name: DEMO_ROUTING_HOTEL.name,
      location: DEMO_ROUTING_HOTEL.location,
      checkIn: startDate,
      checkOut: endDate,
    },
    preferences: { interests: { museums: 3, nature: 2, photography: 2 } },
    pace: { level: "balanced", dayStart: "09:30", dayEnd: "20:00" },
    budget: {},
    createdAt: source.retrievedAt,
    updatedAt: source.retrievedAt,
  });
}

describe("festivos (Nager.Date grabado)", () => {
  const holidays = getHolidaysProvider(demo);

  it("reconoce la región del destino por su etiqueta", () => {
    expect(destinationRegion(madridTrip("2026-01-01", "2026-01-02").destination)).toBe("ES-MD");
    expect(
      destinationRegion(madridTrip("2026-01-01", "2026-01-02", "Madrid, España").destination),
    ).toBeUndefined();
  });

  it("nacionales y regionales de la región; los de otras regiones no", async () => {
    const result = await holidaysForTrip(madridTrip("2026-04-01", "2026-05-03"), holidays);
    expect(result.status.status).toBe("ok");
    expect(result.status.message).toMatch(/locales del municipio pueden faltar/);
    const names = result.holidays.map((h) => `${h.date} ${h.appliesToDestination}`);
    expect(names).toEqual([
      "2026-04-02 yes", // Jueves Santo, también en ES-MD
      "2026-04-03 yes", // Viernes Santo, nacional
      "2026-05-01 yes",
      "2026-05-02 yes", // Fiesta de la Comunidad de Madrid
    ]);
    expect(result.holidays.every((h) => h.isDemo && h.source.name === "Nager.Date")).toBe(true);
  });

  it("sin región reconocida, los regionales quedan como «puede afectar»", async () => {
    const trip = madridTrip("2026-04-06", "2026-04-06", "Madrid, España");
    const result = await holidaysForTrip(trip, holidays);
    expect(result.holidays.map((h) => h.appliesToDestination)).toEqual(["maybe"]);
    expect(holidayMap(result.holidays).get("2026-04-06")).toBe("possible");
  });

  it("un país sin datos grabados se indica como no disponible", async () => {
    const trip = madridTrip("2026-04-06", "2026-04-07");
    const result = await holidaysForTrip(
      { ...trip, destination: { ...trip.destination, countryCode: "JP" } },
      holidays,
    );
    expect(result.status.status).toBe("unsupported");
    expect(result.holidays).toEqual([]);
  });

  it("el horario de un festivo solo está verificado con la regla PH reconocida", () => {
    const context = {
      countryCode: "ES",
      location: { lat: 40.41, lng: -3.69 },
      holidays: new Map([
        ["2026-11-01", "confirmed" as const],
        ["2026-05-02", "confirmed" as const],
      ]),
    };
    // Nacional con PH: la librería lo reconoce → verificado.
    expect(dayOpening("Mo-Su 10:00-20:00; PH 10:00-14:00", "2026-11-01", context)).toEqual({
      kind: "hours",
      windows: [{ start: 600, end: 840, uncertain: false }],
    });
    expect(dayOpening("Mo-Su 10:00-20:00; PH off", "2026-11-01", context)).toEqual({
      kind: "hours",
      windows: [],
    });
    // Sin regla PH, o festivo regional que la librería no conoce → pendiente de confirmar.
    for (const [hours, date] of [
      ["Mo-Su 10:00-20:00", "2026-11-01"],
      ["Mo-Su 10:00-20:00; PH off", "2026-05-02"],
    ] as const) {
      const opening = dayOpening(hours, date, context);
      expect(opening.kind === "hours" && opening.windows.every((w) => w.uncertain)).toBe(true);
    }
  });

  it("el optimizador marca pendiente de confirmar las visitas de un festivo", async () => {
    const trip = madridTrip("2026-11-01", "2026-11-01");
    const { days } = await computeItinerary(trip, {
      places: getPlacesProvider(demo),
      routing: getRoutingProvider(demo),
      holidays,
    });
    const visits = days[0]!.activities.filter((a) => a.kind === "visit");
    expect(visits.length).toBeGreaterThan(0);
    // Ninguna visita del festivo queda como "abierto" confirmado si la fuente no lo verifica.
    for (const activity of visits) {
      const hours = activity.place?.openingHours ?? "";
      if (!/\bPH\b/.test(hours)) expect(activity.planning?.openingStatus).not.toBe("open");
    }
  });
});

describe("calendario del viaje", () => {
  const deps = {
    holidays: getHolidaysProvider(demo),
    weather: getWeatherProvider(demo),
    events: createNotConfiguredEventsProvider("Sin clave"),
  };

  it("une festivos, cambio de hora, previsión y eventos no configurados", async () => {
    const calendar = await buildCalendar(madridTrip("2026-10-24", "2026-11-11"), deps);
    expect(calendar.timeZone).toBe("Europe/Madrid");
    expect(calendar.dst).toMatchObject([{ date: "2026-10-25", from: "03:00", to: "02:00" }]);
    expect(calendar.holidays.map((h) => h.date)).toEqual(["2026-11-01"]);
    expect(calendar.eventsStatus.status).toBe("not_configured");
    expect(calendar.events).toEqual([]);
    expect(calendar.weatherStatus.status).toBe("ok");
    // Solo los días que cubre la previsión grabada (27-10 a 11-11), con fuente y atribución.
    expect(calendar.forecast[0]!.date).toBe("2026-10-27");
    expect(calendar.forecast.at(-1)!.date).toBe("2026-11-11");
    expect(calendar.forecast[0]!.source).toMatchObject({
      name: "Open-Meteo",
      license: "CC BY 4.0",
    });
    expect(calendar.forecast.find((d) => d.date === "2026-11-10")!.precipitationMm).toBeGreaterThan(
      1,
    );
  });

  it("fuera del horizonte de previsión no se muestra ninguna", async () => {
    const calendar = await buildCalendar(madridTrip("2026-12-05", "2026-12-08"), deps);
    expect(calendar.forecast).toEqual([]);
    expect(calendar.weatherStatus.status).toBe("out_of_range");
    expect(calendar.holidays.map((h) => h.date)).toEqual(["2026-12-06", "2026-12-08"]);
  });
});

describe("eventos (Ticketmaster)", () => {
  // Forma de la respuesta de la Discovery API v2, solo para probar el mapeo.
  const response = {
    _embedded: {
      events: [
        {
          id: "Z1",
          name: "Concierto de prueba",
          url: "https://www.ticketmaster.es/event/Z1",
          dates: {
            start: { localDate: "2026-10-30", localTime: "21:00:00" },
            status: { code: "onsale" },
          },
          classifications: [{ segment: { name: "Music" }, genre: { name: "Undefined" } }],
          _embedded: {
            venues: [
              {
                name: "Sala",
                city: { name: "Madrid" },
                location: { latitude: "40.41", longitude: "-3.70" },
              },
            ],
          },
        },
        { id: "Z2", name: "Sin enlace", dates: { start: { localDate: "2026-10-30" } } },
        {
          id: "Z3",
          name: "Fuera",
          url: "https://x.example/e",
          dates: { start: { localDate: "2026-11-30" } },
        },
      ],
    },
  };
  const query = {
    at: { lat: 40.41, lng: -3.7 },
    radiusKm: 10,
    startDate: "2026-10-28",
    endDate: "2026-10-31",
  };

  it("mapea solo eventos con fecha del viaje y enlace", () => {
    const events = mapTicketmaster(response, query, {
      retrievedAt: source.retrievedAt,
      isDemo: false,
    });
    expect(events).toEqual([
      expect.objectContaining({
        id: "ticketmaster:Z1",
        time: "21:00",
        category: "Music",
        genre: undefined,
        venue: { name: "Sala", city: "Madrid", location: { lat: 40.41, lng: -3.7 } },
      }),
    ]);
  });

  it("la clave va solo en la petición del servidor y se cachea", async () => {
    const urls: string[] = [];
    const provider = createTicketmasterProvider({
      apiKey: "clave-secreta",
      userAgent: "test",
      cache: new MemoryCacheStore(),
      fetch: async (url) => {
        urls.push(url);
        return Response.json(response);
      },
    });
    expect(await provider.search(query)).toHaveLength(1);
    expect(await provider.search(query)).toHaveLength(1);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("apikey=clave-secreta");
  });
});

describe("Popular ahora (visitas en Wikipedia)", () => {
  it("interpreta la etiqueta wikipedia de OSM", () => {
    expect(articleFromTag("es:Palacio de las Cortes#Fachada principal")).toEqual({
      project: "es.wikipedia",
      title: "Palacio_de_las_Cortes",
    });
    expect(articleFromTag("sin idioma")).toBeUndefined();
  });

  it("compara la última semana con la media anterior", () => {
    const views = [];
    for (let day = 1; day <= 14; day++) {
      views.push({ date: `2026-10-${String(day).padStart(2, "0")}`, views: day > 7 ? 300 : 100 });
    }
    expect(popularityFrom(views, "2026-10-01", "2026-10-14")).toEqual({
      recentDaily: 300,
      baselineDaily: 100,
      ratio: 3,
      isTrending: true,
    });
  });

  it("usa las visitas grabadas de los lugares de la demo", async () => {
    const places: Place[] = [
      {
        id: "osm:way/1",
        name: "Museo del Prado",
        category: "museum",
        layer: "tourism",
        location: { lat: 40.41, lng: -3.69 },
        wikipedia: "es:Museo del Prado",
        source,
        isDemo: true,
      },
      {
        id: "osm:way/2",
        name: "Sin artículo",
        category: "museum",
        layer: "tourism",
        location: { lat: 40.41, lng: -3.69 },
        source,
        isDemo: true,
      },
    ];
    const result = await popularPlaces(places, getPageviewsProvider(demo));
    expect(result.status).toBe("ok");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ placeId: "osm:way/1", isDemo: true });
    expect(result.results[0]!.recentDaily).toBeGreaterThan(0);
    expect(result.results[0]!.source.name).toMatch(/visitas en Wikipedia/);
  });
});

describe("guardar desde TikTok/Instagram", () => {
  it("reconoce solo enlaces https de los dominios oficiales", () => {
    expect(
      parseSocialLink("https://www.tiktok.com/@a/video/7212345678901234567?is_from_webapp=1"),
    ).toEqual({
      platform: "tiktok",
      url: "https://www.tiktok.com/@a/video/7212345678901234567",
      videoId: "7212345678901234567",
    });
    expect(parseSocialLink("https://vm.tiktok.com/ZMabc/")).toMatchObject({
      platform: "tiktok",
      videoId: undefined,
    });
    expect(parseSocialLink("https://www.instagram.com/reel/Cxyz123/?igsh=1")).toEqual({
      platform: "instagram",
      url: "https://www.instagram.com/reel/Cxyz123/",
    });
    expect(parseSocialLink("http://www.tiktok.com/@a/video/123456")).toBeUndefined();
    expect(parseSocialLink("https://tiktok.com.evil.example/video/123456")).toBeUndefined();
    expect(parseSocialLink("https://www.instagram.com/usuario/")).toBeUndefined();
  });

  it("toma título, autor e id del oEmbed de TikTok", () => {
    const link = parseSocialLink("https://www.tiktok.com/@a/video/7212345678901234567")!;
    const preview = mapTikTokOEmbed(
      {
        title: "Atardecer en el #TemploDeDebod",
        author_name: "Ana",
        author_url: "https://www.tiktok.com/@a",
        embed_product_id: "7212345678901234567",
      },
      link,
      source.retrievedAt,
    );
    expect(preview).toMatchObject({
      status: "ok",
      title: "Atardecer en el #TemploDeDebod",
      authorName: "Ana",
      videoId: "7212345678901234567",
    });
    expect(preview.source?.name).toBe("TikTok (oEmbed)");
  });

  it("Instagram queda sin configurar y la demo no inventa vista previa", async () => {
    const provider = createSocialEmbedProvider({
      userAgent: "t",
      cache: new MemoryCacheStore(),
      demo: true,
    });
    const insta = await provider.preview(parseSocialLink("https://www.instagram.com/p/Cxyz123/")!);
    expect(insta.status).toBe("not_configured");
    const tiktok = await provider.preview(
      parseSocialLink("https://www.tiktok.com/@a/video/7212345678901234567")!,
    );
    expect(tiktok).toMatchObject({ status: "demo_unavailable", videoId: "7212345678901234567" });
    expect(tiktok.title).toBeUndefined();
  });

  it("detecta lugares del texto, también en hashtags, sin palabras genéricas", () => {
    const at = { lat: 40.41, lng: -3.69 };
    const make = (id: string, name: string): Place => ({
      id,
      name,
      category: "attraction",
      layer: "tourism",
      location: at,
      source,
      isDemo: true,
    });
    const places = [
      make("1", "Templo de Debod"),
      make("2", "Madrid"),
      make("3", "Museo del Prado"),
      make("4", "Retiro"),
    ];
    expect(
      detectPlaces("Atardecer en el #TemploDeDebod 🌅 #madrid", places).map((p) => p.id),
    ).toEqual(["1"]);
    expect(detectPlaces("Visita al Museo del Prado y al Retiro", places).map((p) => p.id)).toEqual([
      "3",
      "4",
    ]);
    expect(detectPlaces("", places)).toEqual([]);
  });
});

describe("tengo N horas libres y modo lluvia (demo)", () => {
  const deps = {
    places: getPlacesProvider(demo),
    routing: getRoutingProvider(demo),
    holidays: getHolidaysProvider(demo),
  };

  it("propone lugares que caben con tiempos reales de la matriz", async () => {
    const trip = madridTrip("2026-10-28", "2026-10-29");
    const result = await freeTime(
      trip,
      {
        origin: DEMO_ROUTING_HOTEL.location,
        originLabel: "Hotel",
        date: "2026-10-28",
        start: "16:00",
        minutes: 180,
      },
      deps,
    );
    expect(result.travel.quality).toBe("routed");
    expect(result.suggestions.length).toBeGreaterThan(0);
    for (const s of result.suggestions) {
      expect(s.walkToMinutes + s.visitMinutes + s.walkBackMinutes).toBeLessThanOrEqual(180);
      expect(s.openingStatus).not.toBe("closed");
    }
    expect(result.plan.length).toBeGreaterThan(0);
    expect(result.planMinutes).toBeLessThanOrEqual(180);
  });

  it("sin tiempos calculados no propone nada", async () => {
    const trip = madridTrip("2026-10-28", "2026-10-29");
    const result = await freeTime(
      trip,
      {
        origin: { lat: 40.4153, lng: -3.6845 },
        originLabel: "Retiro",
        date: "2026-10-28",
        start: "10:00",
        minutes: 120,
      },
      deps,
    );
    expect(result.suggestions).toEqual([]);
  });

  it("propone interiores cercanos para las visitas al aire libre", async () => {
    const trip = madridTrip("2026-11-10", "2026-11-10");
    const { days } = await computeItinerary(trip, deps);
    const planned = { ...trip, days };
    const result = await rainAlternatives(planned, "2026-11-10", {
      places: deps.places,
      weather: getWeatherProvider(demo),
      holidays: deps.holidays,
    });
    expect(result.weatherStatus.status).toBe("ok");
    expect(result.forecast?.precipitationMm).toBeGreaterThan(1);
    const outdoor = days[0]!.activities.filter((a) =>
      ["park", "viewpoint", "monument"].includes(a.place?.category ?? ""),
    );
    expect(result.swaps.map((s) => s.activityId)).toEqual(outdoor.map((a) => a.id));
    for (const swap of result.swaps) {
      for (const alt of swap.alternatives) {
        expect(["museum", "gallery", "place_of_worship"]).toContain(alt.place.category);
        expect(alt.straightLineMeters).toBeLessThanOrEqual(1500);
        expect(alt.openingStatus).not.toBe("closed");
      }
    }
  });
});
