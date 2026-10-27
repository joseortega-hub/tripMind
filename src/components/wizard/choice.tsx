"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export interface ChoiceOption<T extends string> {
  value: T;
  title: string;
  description?: string;
}

/** Grupo de opciones exclusivas como tarjetas con radio (zona de toque amplia en móvil). */
export function ChoiceGroup<T extends string>({
  id,
  label,
  value,
  options,
  error,
  columns = 2,
  onChange,
}: {
  id: string;
  label: string;
  value?: T;
  options: ChoiceOption<T>[];
  error?: string;
  columns?: 2 | 3;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p id={`${id}-label`} className="text-sm font-medium">
        {label}
      </p>
      <RadioGroup
        id={id}
        aria-labelledby={`${id}-label`}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={error ? true : undefined}
        value={value ?? ""}
        onValueChange={(next) => onChange(next as T)}
        className={cn("grid gap-2", columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}
      >
        {options.map((option) => {
          const itemId = `${id}-${option.value}`;
          return (
            <Label
              key={option.value}
              htmlFor={itemId}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors",
                "hover:bg-muted has-data-checked:border-cta has-data-checked:bg-accent/60",
                error && "border-destructive/60",
              )}
            >
              <RadioGroupItem id={itemId} value={option.value} className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{option.title}</span>
                {option.description ? (
                  <span className="text-muted-foreground text-xs">{option.description}</span>
                ) : null}
              </span>
            </Label>
          );
        })}
      </RadioGroup>
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
