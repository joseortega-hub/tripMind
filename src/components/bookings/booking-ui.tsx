"use client";

import {
  AlertCircle,
  Ban,
  BadgeCheck,
  CircleHelp,
  CircleSlash,
  ExternalLink,
  Gift,
  Ticket,
} from "lucide-react";
import { useId, useState } from "react";
import { DataSource } from "@/components/data-source";
import { Button } from "@/components/ui/button";
import type {
  BookingLink,
  BookingRequirement,
  BookingStatus,
  BookingUpdate,
  PaidPrice,
} from "@/domain/booking";
import { type BookingTone, linkLabel, requirementText, STATUS_LABELS } from "@/lib/booking/labels";
import { formatPrice } from "@/lib/booking/budget";
import { isWikipediaLink } from "@/lib/booking/info";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<BookingTone, string> = {
  action: "border-foreground/30 text-foreground",
  ok: "border-primary/40 text-primary",
  neutral: "border-border text-muted-foreground",
  pending: "border-amber-600/50 text-amber-800 dark:text-amber-300",
  muted: "border-border text-muted-foreground line-through decoration-1",
};

const REQUIREMENT_ICONS = {
  ticket_required: Ticket,
  booking_recommended: Ticket,
  free: Gift,
  no_booking: CircleSlash,
  unverified: CircleHelp,
} as const;

const REQUIREMENT_TONES: Record<BookingRequirement, BookingTone> = {
  ticket_required: "action",
  booking_recommended: "action",
  free: "ok",
  no_booking: "neutral",
  unverified: "pending",
};

const STATUS_ICONS = {
  pending: AlertCircle,
  booked: BadgeCheck,
  ticket_purchased: BadgeCheck,
  cancelled: Ban,
} as const;

function Tag({
  tone,
  icon: Icon,
  children,
  className,
}: {
  tone: BookingTone;
  icon: typeof Ticket;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1 rounded-md border px-1.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}

/** Estado informativo (de la fuente): siempre visible, también "pendiente de verificar". */
export function RequirementTag({
  requirement,
  isMeal = false,
  className,
}: {
  requirement: BookingRequirement;
  isMeal?: boolean;
  className?: string;
}) {
  return (
    <Tag
      tone={REQUIREMENT_TONES[requirement]}
      icon={REQUIREMENT_ICONS[requirement]}
      className={className}
    >
      {requirementText(requirement, isMeal)}
    </Tag>
  );
}

/** Lo que ha anotado el usuario. Sin anotar no se muestra nada (no hay estado que inventar). */
export function StatusTag({ status, className }: { status: BookingStatus; className?: string }) {
  return (
    <Tag tone={STATUS_LABELS[status].tone} icon={STATUS_ICONS[status]} className={className}>
      <span className="sr-only">Tu reserva: </span>
      {STATUS_LABELS[status].text}
    </Tag>
  );
}

/** Enlaces en orden de prioridad, con qué es cada uno y de dónde sale. */
export function BookingLinks({
  links,
  isMeal = false,
  compact = false,
}: {
  links: readonly BookingLink[];
  isMeal?: boolean;
  compact?: boolean;
}) {
  if (links.length === 0) return null;
  const shown = compact ? links.slice(0, 1) : links;
  return (
    <ul className="flex flex-col gap-1.5">
      {shown.map((link) => {
        const label = linkLabel(link, isMeal);
        return (
          <li key={link.url} className="flex flex-col">
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              data-link-kind={link.kind}
              className="text-primary focus-visible:ring-ring/50 inline-flex min-h-11 items-center gap-1.5 self-start rounded text-sm font-medium underline underline-offset-2 outline-none focus-visible:ring-3 sm:min-h-8"
            >
              {label.title}
              <ExternalLink aria-hidden className="size-3.5" />
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
            {compact && link.kind === "alternative" ? (
              <span className="text-muted-foreground text-xs">
                {isWikipediaLink(link) ? "Información, no venta" : "De otro sitio web"}
              </span>
            ) : null}
            {!compact ? (
              <span className="text-muted-foreground text-xs">
                {label.detail ? `${label.detail}. ` : ""}
                {new URL(link.url).hostname.replace(/^www\./, "")}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Fuente del estado informativo y de los enlaces (OSM, Wikidata). */
export function BookingSources({ links }: { links: readonly BookingLink[] }) {
  const seen = new Set<string>();
  const sources = links.filter((link) => {
    const key = link.source.url ?? link.source.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return sources.map((link) => (
    <DataSource
      key={link.source.url ?? link.source.name}
      source={link.source}
      isDemo={link.isDemo ?? false}
    />
  ));
}

const STATUS_ORDER: BookingStatus[] = ["pending", "booked", "ticket_purchased", "cancelled"];

/**
 * Formulario de lo que anota el usuario: estado, nota y precio pagado (opcional, total). Se guarda
 * solo al pulsar "Guardar"; abrir un enlace de compra no cambia nada.
 */
export function BookingEditor({
  title,
  initial,
  currency,
  isHotel = false,
  saving,
  error,
  onSave,
  onCancel,
}: {
  title: string;
  initial: { status?: BookingStatus; note?: string; paid?: PaidPrice };
  currency: string;
  isHotel?: boolean;
  saving: boolean;
  error?: string;
  onSave: (update: BookingUpdate) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [status, setStatus] = useState<BookingStatus>(initial.status ?? "pending");
  const [note, setNote] = useState(initial.note ?? "");
  const [amount, setAmount] = useState(
    initial.paid ? String(initial.paid.amount).replace(".", ",") : "",
  );
  const [invalid, setInvalid] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = amount.trim().replace(/\s/g, "").replace(",", ".");
    if (normalized && !/^\d+(\.\d{1,2})?$/.test(normalized)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSave({
      status,
      note: note.trim() || null,
      paid: normalized
        ? { amount: Number(normalized), currency: initial.paid?.currency ?? currency }
        : null,
    });
  };

  const statusText = (value: BookingStatus) =>
    isHotel && value === "booked"
      ? "Reservado"
      : isHotel && value === "ticket_purchased"
        ? "Pagado"
        : isHotel && value === "cancelled"
          ? "Cancelado"
          : STATUS_LABELS[value].text;

  return (
    <form
      onSubmit={submit}
      aria-label={`Tu reserva: ${title}`}
      className="bg-muted/50 flex flex-col gap-3 rounded-lg border p-3"
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">Estado de tu reserva</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {STATUS_ORDER.map((value) => (
            <label
              key={value}
              className={cn(
                "has-focus-visible:ring-ring/50 bg-card flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-sm has-focus-visible:ring-3",
                status === value && "border-primary text-primary font-medium",
              )}
            >
              <input
                type="radio"
                name={`${id}-status`}
                value={value}
                checked={status === value}
                onChange={() => setStatus(value)}
                className="accent-primary size-4"
              />
              {statusText(value)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-paid`} className="text-sm font-medium">
          Precio pagado <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`${id}-paid`}
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={`${id}-paid-hint`}
            className="border-input bg-card focus-visible:ring-ring/50 aria-invalid:border-destructive h-11 w-32 rounded-md border px-3 text-base tabular-nums outline-none focus-visible:ring-3"
          />
          <span className="text-sm">{initial.paid?.currency ?? currency}</span>
        </div>
        <p
          id={`${id}-paid-hint`}
          className={cn("text-xs", invalid ? "text-destructive" : "text-muted-foreground")}
        >
          {invalid
            ? "Escribe solo el importe, por ejemplo 24 o 24,50."
            : `Total de todo el grupo${isHotel ? " y todas las noches" : ""}. Cuenta como gasto confirmado.`}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-note`} className="text-sm font-medium">
          Nota <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <textarea
          id={`${id}-note`}
          value={note}
          maxLength={500}
          rows={2}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Localizador, hora de entrada…"
          className="border-input bg-card focus-visible:ring-ring/50 rounded-md border px-3 py-2 text-base outline-none focus-visible:ring-3"
        />
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" className="min-h-11" disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Resumen corto de lo anotado: precio pagado y nota. */
export function BookingNoteLine({ paid, note }: { paid?: PaidPrice; note?: string }) {
  if (!paid && !note) return null;
  return (
    <p className="text-muted-foreground text-xs">
      {paid ? (
        <span className="tabular-nums">Pagado: {formatPrice(paid.amount, paid.currency)}</span>
      ) : null}
      {paid && note ? ". " : null}
      {note ? <span className="break-words">{note}</span> : null}
    </p>
  );
}
