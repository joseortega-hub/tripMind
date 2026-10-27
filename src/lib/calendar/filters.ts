import { z } from "zod";
import { NoticeKindSchema, type TripNotice } from "@/domain/calendar";

/**
 * Filtros de avisos (REQUISITOS §17): tipos (vacío = todos), impacto, día, fuente y "solo lo que
 * afecta a mi itinerario". Se recuerdan por viaje y se aplican igual en calendario, lista y mapa.
 */
export const NoticeFiltersSchema = z.object({
  kinds: z.array(NoticeKindSchema).default([]),
  impact: z.enum(["all", "opportunity", "affects_plan"]).default("all"),
  date: z.string().default("all"),
  source: z.string().default("all"),
  onlyItinerary: z.boolean().default(false),
});
export type NoticeFilters = z.infer<typeof NoticeFiltersSchema>;

export const DEFAULT_NOTICE_FILTERS: NoticeFilters = NoticeFiltersSchema.parse({});

export function applyNoticeFilters(
  notices: readonly TripNotice[],
  filters: NoticeFilters,
): TripNotice[] {
  return notices.filter(
    (notice) =>
      (filters.kinds.length === 0 || filters.kinds.includes(notice.kind)) &&
      (filters.impact === "all" || notice.impact === filters.impact) &&
      (filters.date === "all" || notice.date === filters.date) &&
      (filters.source === "all" || notice.source.name === filters.source) &&
      (!filters.onlyItinerary || notice.affectsItinerary),
  );
}

export const isFiltered = (filters: NoticeFilters) =>
  filters.kinds.length > 0 ||
  filters.impact !== "all" ||
  filters.date !== "all" ||
  filters.source !== "all" ||
  filters.onlyItinerary;

/** Fuentes presentes en los avisos (para el filtro por fuente), en orden alfabético. */
export const noticeSources = (notices: readonly TripNotice[]) =>
  [...new Set(notices.map((notice) => notice.source.name))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );

export const filtersStorageKey = (tripId: string) => `tripmind:notice-filters:${tripId}`;

/** Lee los filtros guardados; cualquier valor ilegible vuelve a los de por defecto. */
export function readStoredFilters(raw: string | null): NoticeFilters {
  if (!raw) return DEFAULT_NOTICE_FILTERS;
  try {
    const parsed = NoticeFiltersSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_NOTICE_FILTERS;
  } catch {
    return DEFAULT_NOTICE_FILTERS;
  }
}
