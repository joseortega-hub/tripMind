"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const errorId = (id: string) => `${id}-error`;
export const hintId = (id: string) => `${id}-hint`;

/** Props ARIA de un control con posible error y ayuda. */
export function describedBy(id: string, error?: string, hint?: string) {
  const ids = [hint ? hintId(id) : null, error ? errorId(id) : null].filter(Boolean);
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": ids.length ? ids.join(" ") : undefined,
  } as const;
}

export function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={errorId(id)} className="text-destructive text-sm">
      {error}
    </p>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? (
        <p id={hintId(id)} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      <FieldError id={id} error={error} />
    </div>
  );
}

/** Contador con botones −/+ (más cómodo que un input numérico en móvil). */
export function Stepper({
  id,
  label,
  hint,
  value,
  min,
  max,
  error,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  error?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-11"
          aria-label={`Quitar: ${label}`}
          aria-controls={id}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          <Minus aria-hidden />
        </Button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isInteger(next)) onChange(next);
          }}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-11 w-14 rounded-lg border bg-transparent text-center text-base tabular-nums outline-none focus-visible:ring-3"
          {...describedBy(id, error, hint)}
        />
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-11"
          aria-label={`Añadir: ${label}`}
          aria-controls={id}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus aria-hidden />
        </Button>
      </div>
      {hint ? (
        <p id={hintId(id)} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      <FieldError id={id} error={error} />
    </div>
  );
}

/** Convierte el valor de un input numérico en número u `undefined` si está vacío. */
export function parseOptionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/** Select nativo con el estilo de los inputs (mejor experiencia en móvil que un popover). */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30 h-11 w-full rounded-lg border bg-transparent px-3 text-base outline-none focus-visible:ring-3 sm:h-9 sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}
