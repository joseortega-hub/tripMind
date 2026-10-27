import type { PaidPrice } from "@/domain/booking";
import type { BudgetCategory } from "@/domain/budget";
import type { Source } from "@/domain/source";
import type { Activity, Trip } from "@/domain/trip";
import { requirementOf } from "./info";

/**
 * Presupuesto acumulado del viaje frente al del asistente (REQUISITOS §6.5). Cada línea es
 * confirmada (lo que el usuario anota como pagado), orientativa (precio de una fuente, con su
 * fecha) o sin precio. TripMind no pone importes: sin dato, la línea queda sin precio.
 */
export type LineCertainty = "confirmed" | "estimated" | "unknown";

export interface BudgetLine {
  /** Id de la actividad, "hotel" o "leg:<id>". */
  id: string;
  category: BudgetCategory;
  label: string;
  date?: string;
  certainty: LineCertainty;
  /** Importe en la moneda del viaje (solo confirmado u orientativo). */
  amount?: number;
  /** Cómo sale el importe orientativo o por qué no hay ("12 € por persona × 2, según OSM"). */
  basis?: string;
  source?: Source;
  /** Reserva cancelada por el usuario: se muestra pero no suma. */
  cancelled: boolean;
}

export type DeviationLevel = "no_plan" | "ok" | "near" | "at_risk" | "over";

export interface Deviation {
  level: DeviationLevel;
  /** Presupuesto − (confirmado + orientativo). Negativo = te pasas. */
  remaining?: number;
}

export interface BudgetPart {
  category: BudgetCategory;
  planned?: number;
  confirmed: number;
  estimated: number;
  unknownCount: number;
  lines: BudgetLine[];
  deviation: Deviation;
}

export interface BudgetSummary {
  currency: string;
  /** Presupuesto total: el del asistente o, si no lo hay, la suma de partidas. */
  planned?: number;
  plannedBasis: "total" | "categories" | "none";
  confirmed: number;
  estimated: number;
  unknownCount: number;
  deviation: Deviation;
  parts: BudgetPart[];
}

/** Precio "desde" de un proveedor autorizado de entradas, por persona. */
export interface OfferPrice {
  amount: number;
  currency: string;
  retrievedAt: string;
  source: Source;
}

/** Margen a partir del cual se avisa de que el presupuesto está cerca de agotarse. */
export const NEAR_THRESHOLD = 0.9;

const CATEGORIES: BudgetCategory[] = ["accommodation", "activities", "food", "transport"];

const round = (value: number) => Math.round(value * 100) / 100;

export function deviationOf(planned: number | undefined, confirmed: number, estimated: number) {
  if (planned === undefined) return { level: "no_plan" } satisfies Deviation;
  const committed = confirmed + estimated;
  const remaining = round(planned - committed);
  const level: DeviationLevel =
    confirmed > planned
      ? "over"
      : committed > planned
        ? "at_risk"
        : committed >= planned * NEAR_THRESHOLD && planned > 0
          ? "near"
          : "ok";
  return { level, remaining } satisfies Deviation;
}

/** Importe con céntimos si los tiene (lo pagado no se redondea). */
export function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

function paidLine(
  base: Omit<BudgetLine, "certainty" | "amount" | "basis">,
  paid: PaidPrice,
  currency: string,
): BudgetLine {
  if (paid.currency !== currency) {
    return {
      ...base,
      certainty: "unknown",
      basis: `Pagado ${formatPrice(paid.amount, paid.currency)}: otra moneda, no se convierte`,
    };
  }
  return {
    ...base,
    certainty: "confirmed",
    amount: paid.amount,
    basis: "Lo que anotaste como pagado",
  };
}

function activityLine(
  activity: Activity,
  date: string,
  trip: Trip,
  offers: ReadonlyMap<string, OfferPrice>,
): BudgetLine | undefined {
  const currency = trip.budget.currency;
  const isMeal = activity.kind === "meal";
  if (!isMeal && !activity.place && !activity.paidPrice) return undefined;
  if (activity.kind === "free_time") return undefined;
  const base = {
    id: activity.id,
    category: (isMeal ? "food" : "activities") as BudgetCategory,
    label: isMeal
      ? activity.place
        ? `${activity.title}: ${activity.place.name}`
        : `${activity.title} (sin sitio elegido)`
      : activity.title,
    date,
    cancelled: activity.bookingStatus === "cancelled",
  };
  if (activity.paidPrice) return paidLine(base, activity.paidPrice, currency);
  if (isMeal || !activity.place) return { ...base, certainty: "unknown" };

  const people = trip.travelers.adults + trip.travelers.children;
  const perPerson = (amount: number, from: string) =>
    `${formatPrice(amount, currency)} por persona × ${people}, ${from}; puede haber tarifas reducidas`;
  const offer = offers.get(activity.place.id);
  if (offer && offer.currency === currency) {
    return {
      ...base,
      certainty: "estimated",
      amount: round(offer.amount * people),
      basis: perPerson(offer.amount, `desde, según ${offer.source.name}`),
      source: offer.source,
    };
  }
  const info = requirementOf(activity.place);
  if (info.charge && info.charge.currency === currency) {
    return {
      ...base,
      certainty: "estimated",
      amount: round(info.charge.amount * people),
      basis: perPerson(info.charge.amount, "según OpenStreetMap"),
      source: info.source,
    };
  }
  if (info.requirement === "free") {
    return {
      ...base,
      certainty: "estimated",
      amount: 0,
      basis: "Gratuita según OpenStreetMap",
      source: info.source,
    };
  }
  return { ...base, certainty: "unknown" };
}

/** Calcula el presupuesto acumulado; `offers` son precios "desde" de un proveedor de entradas. */
export function summarizeBudget(
  trip: Trip,
  offers: ReadonlyMap<string, OfferPrice> = new Map(),
): BudgetSummary {
  const currency = trip.budget.currency;
  const lines: BudgetLine[] = [];

  const hotel = trip.hotel;
  if (hotel) {
    const base = {
      id: "hotel",
      category: "accommodation" as const,
      label: hotel.name,
      date: hotel.checkIn,
      cancelled: hotel.bookingStatus === "cancelled",
    };
    if (hotel.paidPrice) lines.push(paidLine(base, hotel.paidPrice, currency));
    else if (
      hotel.price &&
      hotel.price.certainty !== "unknown" &&
      hotel.price.amount !== undefined &&
      hotel.price.currency === currency
    ) {
      lines.push({
        ...base,
        certainty: hotel.price.certainty,
        amount: hotel.price.amount,
        source: hotel.price.source,
      });
    } else lines.push({ ...base, certainty: "unknown" });
  }

  for (const day of trip.days) {
    for (const activity of day.activities) {
      const line = activityLine(activity, day.date, trip, offers);
      if (line) lines.push(line);
    }
    // Trayectos en coche o transporte público: TripMind no conoce tarifas (taxi, billetes).
    for (const leg of day.legs) {
      if (leg.mode !== "car" && leg.mode !== "transit") continue;
      lines.push({
        id: `leg:${leg.id}`,
        category: "transport",
        label: leg.mode === "car" ? "Trayecto en taxi o coche" : "Trayecto en transporte público",
        date: day.date,
        certainty: "unknown",
        cancelled: false,
      });
    }
  }

  const parts = CATEGORIES.map((category): BudgetPart => {
    const own = lines.filter((line) => line.category === category);
    const counted = own.filter((line) => !line.cancelled);
    const sum = (certainty: LineCertainty) =>
      round(
        counted
          .filter((line) => line.certainty === certainty)
          .reduce((total, line) => total + (line.amount ?? 0), 0),
      );
    const confirmed = sum("confirmed");
    const estimated = sum("estimated");
    const planned = trip.budget.categories[category];
    return {
      category,
      planned,
      confirmed,
      estimated,
      unknownCount: counted.filter((line) => line.certainty === "unknown").length,
      lines: own,
      deviation: deviationOf(planned, confirmed, estimated),
    };
  });

  const categoryValues = CATEGORIES.map((category) => trip.budget.categories[category]).filter(
    (value): value is number => value !== undefined,
  );
  const plannedBasis =
    trip.budget.total !== undefined ? "total" : categoryValues.length > 0 ? "categories" : "none";
  const planned =
    trip.budget.total ??
    (categoryValues.length > 0 ? round(categoryValues.reduce((a, b) => a + b, 0)) : undefined);
  const confirmed = round(parts.reduce((total, part) => total + part.confirmed, 0));
  const estimated = round(parts.reduce((total, part) => total + part.estimated, 0));
  return {
    currency,
    planned,
    plannedBasis,
    confirmed,
    estimated,
    unknownCount: parts.reduce((total, part) => total + part.unknownCount, 0),
    deviation: deviationOf(planned, confirmed, estimated),
    parts,
  };
}
