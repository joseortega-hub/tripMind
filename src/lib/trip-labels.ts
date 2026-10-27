import type {
  AccommodationPreferences,
  BudgetCategory,
  Interest,
  Pace,
  PlaceCategory,
  WizardStep,
} from "@/domain";

export const STEP_LABELS: Record<WizardStep, string> = {
  destination: "Destino y fechas",
  accommodation: "Alojamiento",
  interests: "Intereses",
  pace: "Ritmo",
  budget: "Presupuesto",
  summary: "Resumen",
};

export const INTEREST_LABELS: Record<Interest, string> = {
  monuments_history: "Monumentos e historia",
  museums: "Museos",
  nature: "Naturaleza",
  beaches: "Playas",
  gastronomy: "Gastronomía",
  shopping: "Compras",
  nightlife: "Vida nocturna",
  concerts_events: "Conciertos y eventos",
  sports: "Deporte",
  theme_parks: "Parques temáticos",
  original_experiences: "Experiencias originales",
  hidden_gems: "Lugares poco conocidos",
  photography: "Fotografía",
  architecture: "Arquitectura",
  family: "Plan familiar",
  free: "Gratis",
};

export const INTEREST_WEIGHT_LABELS: Record<number, string> = {
  1: "Algo",
  2: "Bastante",
  3: "Mucho",
};

export const PACE_LABELS: Record<Pace["level"], { title: string; description: string }> = {
  relaxed: { title: "Relajado", description: "Pocas visitas al día y margen para improvisar." },
  balanced: { title: "Equilibrado", description: "Un ritmo cómodo combinando visitas y descanso." },
  intensive: { title: "Intensivo", description: "Aprovechar al máximo cada día." },
};

export const ACCOMMODATION_TYPE_LABELS: Record<AccommodationPreferences["types"][number], string> =
  {
    hotel: "Hotel",
    apartment: "Apartamento",
    hostel: "Hostal / albergue",
    other: "Otro",
  };

export const ZONE_LABELS: Record<AccommodationPreferences["zone"], string> = {
  central: "Céntrica",
  well_connected: "Bien comunicada",
  any: "Me da igual",
};

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  accommodation: "Alojamiento",
  food: "Comida",
  activities: "Actividades",
  transport: "Transporte",
};

export const LODGING_LABELS: Partial<Record<PlaceCategory, string>> = {
  hotel: "Hotel",
  hostel: "Hostal / albergue",
  apartment: "Apartamento",
  guest_house: "Casa de huéspedes",
};

export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "MXN", "ARS", "COP", "CLP"] as const;

const dayFormat = new Intl.DateTimeFormat("es-ES", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const longFormat = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "lun, 10 nov" para una fecha "YYYY-MM-DD" (sin desfase de zona horaria). */
export const formatDay = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));
export const formatLongDate = (date: string) => longFormat.format(new Date(`${date}T00:00:00Z`));

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function travelersText({ adults, children }: { adults: number; children: number }) {
  const parts = [`${adults} ${adults === 1 ? "adulto" : "adultos"}`];
  if (children > 0) parts.push(`${children} ${children === 1 ? "menor" : "menores"}`);
  return parts.join(" y ");
}
