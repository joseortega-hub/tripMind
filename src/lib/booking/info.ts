import type { BookingLink, BookingLinkKind, BookingRequirement } from "@/domain/booking";
import type { Place } from "@/domain/place";
import type { Source } from "@/domain/source";

/**
 * Estado informativo de entradas de un lugar (REQUISITOS §12), derivado solo de etiquetas de la
 * fuente. Sin datos queda "pendiente de verificar": nunca se presupone gratis ni sin reserva.
 */
export interface RequirementInfo {
  requirement: BookingRequirement;
  /** Qué dice la fuente, en frases cortas ("Tarifa según OSM: «15€…»"). */
  evidence: string[];
  /** Fuente de las etiquetas (ficha OSM del lugar); ausente si no hay datos. */
  source?: Source;
  /** Tarifa por persona si `charge` es un importe claro ("12 EUR", "€ 8,50"). */
  charge?: { amount: number; currency: string };
}

const CURRENCY_SYMBOLS: Record<string, string> = { "€": "EUR", $: "USD", "£": "GBP" };

/**
 * Importe de la etiqueta `charge` solo si es un número con una moneda reconocible; cualquier otro
 * texto ("12 EUR/adult; 6 EUR/child", "varies") no se interpreta.
 */
export function parseCharge(value: string | undefined): RequirementInfo["charge"] {
  const text = value?.trim();
  if (!text) return undefined;
  const match =
    text.match(/^(?<amount>\d+(?:[.,]\d{1,2})?)\s*(?<currency>€|\$|£|[A-Z]{3})$/u) ??
    text.match(/^(?<currency>€|\$|£|[A-Z]{3})\s*(?<amount>\d+(?:[.,]\d{1,2})?)$/u);
  if (!match?.groups) return undefined;
  const currency = CURRENCY_SYMBOLS[match.groups.currency!] ?? match.groups.currency!;
  return { amount: Number(match.groups.amount!.replace(",", ".")), currency };
}

/** `fee` con importe ("15€", "12 EUR") o expresamente de pago. */
const looksPaid = (fee: string) =>
  fee === "yes" || /\d\s*(€|\$|£|eur|usd|gbp)|(€|\$|£)\s*\d/iu.test(fee);
const isDonation = (fee: string) => /^donation\b/i.test(fee);

/** Texto libre de la fuente, tal cual y entre comillas (sin punto final añadido). */
const quoted = (text: string) => `«${text}»`;

function visitRequirement(place: Place): RequirementInfo {
  const tickets = place.tickets;
  if (!tickets) return { requirement: "unverified", evidence: [] };
  const evidence: string[] = [];
  const fee = tickets.fee?.trim();
  const feeLower = fee?.toLowerCase();
  const charge = parseCharge(tickets.charge);

  if (feeLower === "yes") evidence.push("De pago según OpenStreetMap.");
  else if (feeLower === "no") evidence.push("Gratuita según OpenStreetMap.");
  else if (fee && isDonation(fee)) evidence.push(`Donativo según OpenStreetMap: ${quoted(fee)}`);
  else if (fee) evidence.push(`Tarifa según OpenStreetMap: ${quoted(fee)}`);
  if (tickets.charge) evidence.push(`Precio publicado en OpenStreetMap: ${quoted(tickets.charge)}`);
  if (tickets.reservation === "required") evidence.push("Reserva obligatoria según OpenStreetMap.");
  if (tickets.reservation === "recommended")
    evidence.push("Reserva recomendada según OpenStreetMap.");
  if (tickets.reservation === "no") evidence.push("Sin reserva según OpenStreetMap.");
  if (tickets.reservation === "yes") evidence.push("Admite reservas según OpenStreetMap.");

  const paid = Boolean(charge) || (fee !== undefined && !isDonation(fee) && looksPaid(feeLower!));
  const free = feeLower === "no" || (fee !== undefined && isDonation(fee));
  const requirement: BookingRequirement =
    tickets.reservation === "required" || paid
      ? "ticket_required"
      : tickets.reservation === "recommended"
        ? "booking_recommended"
        : free
          ? "free"
          : tickets.reservation === "no"
            ? "no_booking"
            : "unverified";
  return {
    requirement,
    evidence,
    source: evidence.length > 0 ? place.source : undefined,
    charge,
  };
}

function mealRequirement(place: Place): RequirementInfo {
  const reservation = place.food?.reservation;
  if (!reservation) return { requirement: "unverified", evidence: [] };
  const map = {
    required: ["ticket_required", "Reserva obligatoria según OpenStreetMap."],
    recommended: ["booking_recommended", "Reserva recomendada según OpenStreetMap."],
    no: ["no_booking", "No admite reservas según OpenStreetMap."],
    yes: ["unverified", "Admite reservas según OpenStreetMap."],
  } as const;
  const [requirement, text] = map[reservation];
  return { requirement, evidence: [text], source: place.source };
}

/** Estado informativo de un lugar: visitas por `fee`/`charge`/`reservation`, comidas por `reservation`. */
export function requirementOf(place: Place | undefined): RequirementInfo {
  if (!place) return { requirement: "unverified", evidence: [] };
  if (place.layer === "food") return mealRequirement(place);
  if (place.layer === "tourism") return visitRequirement(place);
  return { requirement: "unverified", evidence: [] };
}

/** Prioridad de enlaces (REQUISITOS §12): menor = antes. */
export const LINK_PRIORITY: Record<BookingLinkKind, number> = {
  official: 0,
  official_box_office: 1,
  authorized_reseller: 2,
  alternative: 3,
};

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
};

/** Mismo sitio: un dominio contiene al otro (entradas.museo.es ↔ museo.es). */
function sameSite(a: string, b: string) {
  const [hostA, hostB] = [hostOf(a), hostOf(b)];
  if (!hostA || !hostB) return false;
  return hostA === hostB || hostA.endsWith(`.${hostB}`) || hostB.endsWith(`.${hostA}`);
}

function wikipediaUrl(tag: string | undefined): string | undefined {
  const match = tag?.match(/^([a-z]{2,3}(?:-[a-z]+)?):(.+)$/i);
  if (!match) return undefined;
  const [, lang, title] = match;
  return `https://${lang!.toLowerCase()}.wikipedia.org/wiki/${encodeURIComponent(title!.trim().replaceAll(" ", "_"))}`;
}

/**
 * Enlaces de un lugar en orden de prioridad: web oficial (Wikidata P856 u OSM `website`), página de
 * venta o reserva publicada en OSM (oficial si es del mismo sitio; si no, alternativa), proveedores
 * autorizados (`extra`) y, al final, el artículo de Wikipedia de la etiqueta `wikipedia`. Solo URLs
 * que vienen de una fuente; nunca se construyen direcciones de compra.
 */
export function bookingLinksOf(place: Place, extra: readonly BookingLink[] = []): BookingLink[] {
  const links: BookingLink[] = [];
  if (place.website) {
    const fromWikidata = place.websiteSource === "wikidata" && place.wikidataId;
    links.push({
      url: place.website,
      kind: "official",
      isGeneralWebsite: true,
      source: fromWikidata
        ? {
            name: "Wikidata (P856, web oficial)",
            url: `https://www.wikidata.org/wiki/${place.wikidataId}`,
            retrievedAt: place.websiteRetrievedAt ?? place.source.retrievedAt,
            license: "CC0 1.0",
          }
        : place.source,
      isDemo: place.isDemo,
    });
  }
  const sales = place.tickets?.ticketsUrl ?? place.food?.reservationUrl;
  if (sales) {
    links.push({
      url: sales,
      kind: place.website && sameSite(sales, place.website) ? "official_box_office" : "alternative",
      isGeneralWebsite: false,
      source: place.source,
      isDemo: place.isDemo,
    });
  }
  links.push(...extra);
  const wiki = wikipediaUrl(place.wikipedia);
  if (wiki) {
    links.push({
      url: wiki,
      kind: "alternative",
      isGeneralWebsite: true,
      source: place.source,
      isDemo: place.isDemo,
    });
  }
  const seen = new Set<string>();
  return links
    .map((link, index) => ({ link, index }))
    .sort((a, b) => LINK_PRIORITY[a.link.kind] - LINK_PRIORITY[b.link.kind] || a.index - b.index)
    .map(({ link }) => link)
    .filter((link) => {
      const key = link.url.replace(/\/+$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** El enlace de Wikipedia es informativo; el resto lleva a la web del lugar o a la venta. */
export const isWikipediaLink = (link: BookingLink) => /\.wikipedia\.org\//.test(link.url);
