import type {
  BookingLink,
  BookingLinkKind,
  BookingRequirement,
  BookingStatus,
} from "@/domain/booking";

/** Tono visual de un estado: el color siempre va con icono y texto (docs/DISENO.md). */
export type BookingTone = "action" | "ok" | "neutral" | "pending" | "muted";

export const REQUIREMENT_LABELS: Record<
  BookingRequirement,
  { text: string; meal?: string; tone: BookingTone }
> = {
  ticket_required: { text: "Entrada necesaria", meal: "Reserva necesaria", tone: "action" },
  booking_recommended: { text: "Reserva recomendada", tone: "action" },
  free: { text: "Gratuita", tone: "ok" },
  no_booking: { text: "Sin reserva", tone: "neutral" },
  unverified: { text: "Pendiente de verificar", tone: "pending" },
};

export const requirementText = (requirement: BookingRequirement, isMeal = false) =>
  (isMeal ? REQUIREMENT_LABELS[requirement].meal : undefined) ??
  REQUIREMENT_LABELS[requirement].text;

/** Estado que marca el usuario. Sin marcar no se muestra nada. */
export const STATUS_LABELS: Record<BookingStatus, { text: string; tone: BookingTone }> = {
  pending: { text: "Por reservar", tone: "pending" },
  booked: { text: "Reservada", tone: "ok" },
  ticket_purchased: { text: "Entrada comprada", tone: "ok" },
  cancelled: { text: "Cancelada", tone: "muted" },
};

export const HOTEL_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Por reservar",
  booked: "Reservado",
  ticket_purchased: "Pagado",
  cancelled: "Cancelado",
};

const KIND_LABELS: Record<BookingLinkKind, string> = {
  official: "Web oficial",
  official_box_office: "Venta oficial",
  authorized_reseller: "Proveedor autorizado",
  alternative: "Enlace alternativo",
};

/** Texto del enlace: qué es y, si es la web general, que las entradas hay que buscarlas allí. */
export function linkLabel(link: BookingLink, isMeal = false): { title: string; detail?: string } {
  if (link.kind === "official") {
    return {
      title: "Web oficial",
      detail: isMeal ? "Web general del local" : "Web general: busca allí las entradas",
    };
  }
  if (link.kind === "official_box_office") {
    return { title: isMeal ? "Reservar en la web del local" : "Venta oficial de entradas" };
  }
  if (link.kind === "authorized_reseller") {
    return { title: link.providerName ?? KIND_LABELS.authorized_reseller };
  }
  if (/\.wikipedia\.org\//.test(link.url)) {
    return { title: "Wikipedia", detail: "Información, no venta" };
  }
  return {
    title: isMeal ? "Reserva publicada en OpenStreetMap" : "Venta publicada en OpenStreetMap",
    detail: "De otro sitio web: comprueba que es de confianza",
  };
}
