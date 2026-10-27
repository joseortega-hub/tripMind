import { describe, expect, it } from "vitest";
import type { Place } from "@/domain/place";
import { ticketsOf } from "@/server/providers/pois/overpass";
import { bookingLinksOf, parseCharge, requirementOf } from "./info";
import { linkLabel, requirementText } from "./labels";

const retrievedAt = "2026-10-26T21:33:43.876Z";
const osmSource = {
  name: "OpenStreetMap (Overpass API)",
  url: "https://www.openstreetmap.org/way/1",
  retrievedAt,
  license: "ODbL 1.0",
};

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: "osm:way/1",
    name: "Museo del Prado",
    category: "museum",
    layer: "tourism",
    location: { lat: 40.4138, lng: -3.6921 },
    source: osmSource,
    isDemo: true,
    ...overrides,
  };
}

describe("ticketsOf (etiquetas OSM)", () => {
  it("conserva fee, charge, reservation y la web de venta", () => {
    expect(
      ticketsOf({
        fee: " yes ",
        charge: "12 EUR",
        reservation: "recommended",
        "website:tickets": "https://entradas.museo.es/",
      }),
    ).toEqual({
      fee: "yes",
      charge: "12 EUR",
      reservation: "recommended",
      ticketsUrl: "https://entradas.museo.es/",
    });
  });

  it("sin etiquetas devuelve undefined y descarta URLs no web", () => {
    expect(ticketsOf({ name: "Plaza" })).toBeUndefined();
    expect(ticketsOf({ "website:tickets": "ftp://x" })).toBeUndefined();
  });
});

describe("requirementOf (estado informativo)", () => {
  it("sin datos de la fuente queda pendiente de verificar", () => {
    expect(requirementOf(place()).requirement).toBe("unverified");
    expect(requirementOf(place()).evidence).toEqual([]);
    expect(requirementOf(undefined).requirement).toBe("unverified");
  });

  it.each([
    [{ fee: "yes" }, "ticket_required"],
    [{ fee: "15€. 2h before closing free." }, "ticket_required"],
    [{ charge: "12 EUR" }, "ticket_required"],
    [{ fee: "no" }, "free"],
    [{ fee: "donation 3 Euros" }, "free"],
    [{ reservation: "required" as const, fee: "no" }, "ticket_required"],
    [{ reservation: "recommended" as const }, "booking_recommended"],
    [{ reservation: "no" as const }, "no_booking"],
    [{ fee: "Sunday free" }, "unverified"],
    [{ reservation: "yes" as const }, "unverified"],
  ])("%o → %s", (tickets, expected) => {
    const info = requirementOf(place({ tickets }));
    expect(info.requirement).toBe(expected);
    expect(info.source).toEqual(osmSource);
    expect(info.evidence.length).toBeGreaterThan(0);
  });

  it("muestra el texto libre de la fuente tal cual", () => {
    const info = requirementOf(place({ tickets: { fee: "15€. 2h before closing free." } }));
    expect(info.evidence[0]).toContain("«15€. 2h before closing free.»");
    expect(info.charge).toBeUndefined();
  });

  it("comidas: solo la etiqueta reservation del local", () => {
    const restaurant = place({ category: "restaurant", layer: "food" });
    expect(requirementOf(restaurant).requirement).toBe("unverified");
    expect(requirementOf({ ...restaurant, food: { reservation: "required" } }).requirement).toBe(
      "ticket_required",
    );
    expect(requirementText("ticket_required", true)).toBe("Reserva necesaria");
    expect(requirementText("ticket_required")).toBe("Entrada necesaria");
  });

  it("alojamiento y transporte no tienen estado de entradas", () => {
    const hotel = place({ category: "hotel", layer: "lodging", tickets: { fee: "yes" } });
    expect(requirementOf(hotel).requirement).toBe("unverified");
  });
});

describe("parseCharge", () => {
  it.each([
    ["12 EUR", { amount: 12, currency: "EUR" }],
    ["8,50 €", { amount: 8.5, currency: "EUR" }],
    ["€ 10", { amount: 10, currency: "EUR" }],
    ["£5", { amount: 5, currency: "GBP" }],
  ])("%s", (raw, expected) => expect(parseCharge(raw)).toEqual(expected));

  it.each(["12 EUR/adult; 6 EUR/child", "varies", "", undefined])("no interpreta %s", (raw) =>
    expect(parseCharge(raw)).toBeUndefined(),
  );
});

describe("bookingLinksOf (prioridad de enlaces)", () => {
  const reseller = {
    url: "https://reventa.example/prado",
    kind: "authorized_reseller" as const,
    isGeneralWebsite: false,
    providerName: "Vendedor",
    source: { name: "Vendedor", retrievedAt },
  };

  it("web oficial > venta oficial > proveedor autorizado > alternativa", () => {
    const links = bookingLinksOf(
      place({
        website: "https://www.museodelprado.es/",
        websiteSource: "wikidata",
        websiteRetrievedAt: "2026-10-26T22:00:00.000Z",
        wikidataId: "Q160112",
        wikipedia: "es:Museo del Prado",
        tickets: { ticketsUrl: "https://entradas.museodelprado.es/compra" },
      }),
      [reseller],
    );
    expect(links.map((link) => link.kind)).toEqual([
      "official",
      "official_box_office",
      "authorized_reseller",
      "alternative",
    ]);
    expect(links[0]).toMatchObject({
      isGeneralWebsite: true,
      source: {
        url: "https://www.wikidata.org/wiki/Q160112",
        retrievedAt: "2026-10-26T22:00:00.000Z",
      },
    });
    expect(links[1]!.isGeneralWebsite).toBe(false);
    expect(links[3]!.url).toBe("https://es.wikipedia.org/wiki/Museo_del_Prado");
    expect(linkLabel(links[0]!).detail).toMatch(/web general/i);
    expect(linkLabel(links[3]!).detail).toMatch(/no venta/i);
  });

  it("una web de venta de otro dominio es alternativa, no oficial", () => {
    const links = bookingLinksOf(
      place({
        website: "https://museo.es",
        websiteSource: "osm",
        tickets: { ticketsUrl: "https://otra-tienda.example/museo" },
      }),
    );
    expect(links.map((link) => [link.kind, link.source.name])).toEqual([
      ["official", "OpenStreetMap (Overpass API)"],
      ["alternative", "OpenStreetMap (Overpass API)"],
    ]);
  });

  it("sin datos de la fuente no hay enlaces (nunca se inventan)", () => {
    expect(bookingLinksOf(place())).toEqual([]);
  });

  it("no repite la misma URL", () => {
    const links = bookingLinksOf(
      place({ website: "https://museo.es/", tickets: { ticketsUrl: "https://museo.es" } }),
    );
    expect(links).toHaveLength(1);
  });
});
