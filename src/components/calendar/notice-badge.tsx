import { NOTICE_LETTERS, type NoticeKind } from "@/domain/calendar";
import { NOTICE_NAMES } from "@/lib/calendar/notices";
import { cn } from "@/lib/utils";

/** Clases de los tokens `--notice-*` (completas para que Tailwind las genere). */
export const NOTICE_BG: Record<NoticeKind, string> = {
  holiday: "bg-notice-holiday",
  event: "bg-notice-event",
  dst: "bg-notice-dst",
  closure: "bg-notice-closure",
  transport: "bg-notice-transport",
  weather: "bg-notice-weather",
  booking: "bg-notice-booking",
};

/**
 * Insignia de un tipo de aviso: letra + color + nombre accesible, nunca solo color (§17).
 * La forma es fija (cuadrado redondeado) para distinguirla de los marcadores de capas.
 */
export function NoticeBadge({
  kind,
  size = "md",
  decorative = false,
  className,
}: {
  kind: NoticeKind;
  size?: "sm" | "md" | "lg";
  /** Si el nombre ya está escrito al lado, la insignia no se anuncia dos veces. */
  decorative?: boolean;
  className?: string;
}) {
  return (
    <span
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": NOTICE_NAMES[kind] })}
      title={NOTICE_NAMES[kind]}
      data-notice-kind={kind}
      className={cn(
        "text-notice-foreground inline-flex shrink-0 items-center justify-center rounded-[5px] leading-none font-bold tabular-nums",
        NOTICE_BG[kind],
        size === "sm" && "size-4 text-[0.625rem]",
        size === "md" && "size-5 text-xs",
        size === "lg" && "size-7 text-sm",
        className,
      )}
    >
      {NOTICE_LETTERS[kind]}
    </span>
  );
}
