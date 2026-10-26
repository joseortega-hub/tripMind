import { describe, expect, it } from "vitest";
import type { GeocodeResult } from "./geocoding";
import type { Place } from "./place";
import {
  buildTripInput,
  createEmptyDraft,
  firstInvalidStep,
  MAX_TRIP_DAYS,
  nightsBetween,
  tripDates,
  validateStep,
  type WizardDraft,
} from "./wizard";

const source = {
  name: "Photon (komoot, datos OpenStreetMap)",
  retrievedAt: "2026-10-26T10:00:00.000Z",
};

const madrid: GeocodeResult = {
  id: "osm:relation/5326784",
  name: "Madrid",
  label: "Madrid, Comunidad de Madrid, España",
  kind: "city",
  location: { lat: 40.416782, lng: -3.703507 },
  countryCode: "ES",
  source,
  isDemo: true,
};

const hotel: Place = {
  id: "osm:node/1",
  name: "Hotel de prueba",
  category: "hotel",
  layer: "lodging",
  location: { lat: 40.41, lng: -3.69 },
  source: { ...source, name: "OpenStreetMap (Overpass API)" },
  isDemo: true,
};

function completeDraft(overrides: Partial<WizardDraft> = {}): WizardDraft {
  return {
    ...createEmptyDraft(),
    destination: madrid,
    startDate: "2026-11-10",
    endDate: "2026-11-13",
    hasHotel: false,
    interests: { museums: 3, gastronomy: 2 },
    ...overrides,
  };
}

describe("tripDates / nightsBetween", () => {
  it("incluye llegada y salida", () => {
    expect(tripDates("2026-11-10", "2026-11-12")).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
    ]);
    expect(nightsBetween("2026-11-10", "2026-11-12")).toBe(2);
  });

  it("cruza meses y devuelve vacío si las fechas no son válidas", () => {
    expect(tripDates("2026-10-31", "2026-11-01")).toEqual(["2026-10-31", "2026-11-01"]);
    expect(tripDates("2026-11-12", "2026-11-10")).toEqual([]);
    expect(tripDates("", "2026-11-10")).toEqual([]);
    expect(nightsBetween("", "")).toBe(0);
  });
});

describe("paso 1: destino y fechas", () => {
  it("exige destino elegido de la lista y fechas, con mensajes en español", () => {
    const result = validateStep("destination", createEmptyDraft());
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.destination).toMatch(/destino/);
    expect(result.errors.startDate).toBe("Indica la fecha de llegada");
    expect(result.errors.endDate).toBe("Indica la fecha de salida");
  });

  it("rechaza salida anterior a la llegada y viajes demasiado largos", () => {
    const reversed = validateStep(
      "destination",
      completeDraft({ startDate: "2026-11-13", endDate: "2026-11-10" }),
    );
    expect(reversed.success || reversed.errors.endDate).toMatch(/anterior/);

    const tooLong = validateStep(
      "destination",
      completeDraft({ startDate: "2026-01-01", endDate: "2026-12-31" }),
    );
    expect(tooLong.success || tooLong.errors.endDate).toContain(String(MAX_TRIP_DAYS));
  });

  it("exige al menos un adulto", () => {
    const result = validateStep(
      "destination",
      completeDraft({ travelers: { adults: 0, children: 2 } }),
    );
    expect(result.success || result.errors["travelers.adults"]).toBeTruthy();
    expect(result.success).toBe(false);
  });

  it("acepta un destino con fuente y fechas válidas", () => {
    expect(validateStep("destination", completeDraft())).toEqual({ success: true });
  });
});

describe("paso 2: alojamiento", () => {
  it("pide contestar si ya hay hotel", () => {
    const result = validateStep("accommodation", completeDraft({ hasHotel: undefined }));
    expect(result).toEqual({
      success: false,
      errors: { hasHotel: "Indica si ya tienes alojamiento" },
    });
  });

  it("con hotel exige elegir un alojamiento real", () => {
    const missing = validateStep("accommodation", completeDraft({ hasHotel: true }));
    expect(missing.success || missing.errors.hotelPlace).toMatch(/alojamiento/);

    const museum = { ...hotel, category: "museum" as const, layer: "tourism" as const };
    expect(
      validateStep("accommodation", completeDraft({ hasHotel: true, hotelPlace: museum })).success,
    ).toBe(false);
    expect(
      validateStep("accommodation", completeDraft({ hasHotel: true, hotelPlace: hotel })).success,
    ).toBe(true);
  });

  it("sin hotel valida las preferencias", () => {
    const draft = completeDraft();
    draft.accommodation = { ...draft.accommodation, rooms: 0 };
    expect(validateStep("accommodation", draft).success).toBe(false);
  });
});

describe("pasos 3-5", () => {
  it("exige al menos un interés", () => {
    const result = validateStep("interests", completeDraft({ interests: {} }));
    expect(result.success || result.errors.interests).toBe("Elige al menos un interés");
  });

  it("los días libres deben estar dentro del viaje y no ocuparlo entero", () => {
    const draft = completeDraft();
    const outside = validateStep("pace", {
      ...draft,
      pace: { ...draft.pace, restDays: ["2026-12-01"] },
    });
    expect(outside.success || outside.errors["pace.restDays"]).toMatch(/dentro/);

    const all = validateStep("pace", {
      ...draft,
      pace: { ...draft.pace, restDays: tripDates(draft.startDate, draft.endDate) },
    });
    expect(all.success || all.errors["pace.restDays"]).toMatch(/al menos un día/);
  });

  it("la hora de fin debe ser posterior a la de inicio", () => {
    const draft = completeDraft();
    const result = validateStep("pace", {
      ...draft,
      pace: { ...draft.pace, dayStart: "20:00", dayEnd: "09:00" },
    });
    expect(result.success || result.errors["pace.dayEnd"]).toMatch(/anterior/);
  });

  it("las partidas no pueden superar el total", () => {
    const draft = completeDraft({
      budget: { currency: "EUR", total: 500, categories: { accommodation: 400, food: 200 } },
    });
    const result = validateStep("budget", draft);
    expect(result.success || result.errors["budget.categories"]).toMatch(/suman más/);
    draft.budget.total = undefined;
    expect(validateStep("budget", draft).success).toBe(true);
  });
});

describe("buildTripInput", () => {
  it("indica el primer paso pendiente", () => {
    expect(firstInvalidStep(createEmptyDraft())).toBe("destination");
    expect(firstInvalidStep(completeDraft({ interests: {} }))).toBe("interests");
    const result = buildTripInput(completeDraft({ hasHotel: undefined }));
    expect(result.success || result.errors.step).toBe("accommodation");
  });

  it("sin hotel guarda las preferencias de alojamiento", () => {
    const result = buildTripInput(completeDraft({ title: "  Puente en Madrid  " }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.title).toBe("Puente en Madrid");
    expect(result.data.hotel).toBeUndefined();
    expect(result.data.accommodationPreferences?.rooms).toBe(1);
    expect(result.data.preferences.interests).toEqual({ museums: 3, gastronomy: 2 });
  });

  it("con hotel lo usa como origen con las fechas del viaje", () => {
    const result = buildTripInput(completeDraft({ hasHotel: true, hotelPlace: hotel, title: "" }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.title).toBeUndefined();
    expect(result.data.accommodationPreferences).toBeUndefined();
    expect(result.data.hotel).toMatchObject({
      name: "Hotel de prueba",
      location: hotel.location,
      checkIn: "2026-11-10",
      checkOut: "2026-11-13",
      place: { source: hotel.source, isDemo: true },
    });
  });
});
