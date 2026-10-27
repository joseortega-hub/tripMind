"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { type Interest, InterestSchema } from "@/domain";
import { INTEREST_LABELS, INTEREST_WEIGHT_LABELS } from "@/lib/trip-labels";
import { cn } from "@/lib/utils";
import type { StepProps } from "./steps";

const WEIGHTS = [1, 2, 3] as const;

export function InterestsStep({ draft, update, errors }: StepProps) {
  const { interests } = draft;
  const selected = Object.keys(interests).length;

  const toggle = (interest: Interest, on: boolean) => {
    const next = { ...interests };
    if (on) next[interest] = 2;
    else delete next[interest];
    update({ interests: next });
  };

  return (
    <fieldset
      className="flex flex-col gap-4"
      aria-describedby={errors.interests ? "interests-error" : "interests-hint"}
    >
      <legend className="sr-only">Intereses</legend>
      <p id="interests-hint" className="text-muted-foreground text-sm">
        Marca lo que te apetece y ajusta cuánto te interesa cada cosa.{" "}
        <span aria-live="polite">
          {selected > 0 ? `${selected} ${selected === 1 ? "elegido" : "elegidos"}.` : ""}
        </span>
      </p>
      {errors.interests ? (
        <p id="interests-error" className="text-destructive text-sm">
          {errors.interests}
        </p>
      ) : null}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {InterestSchema.options.map((interest) => {
          const weight = interests[interest];
          const checked = weight !== undefined;
          const id = `interest-${interest}`;
          return (
            <li
              key={interest}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3 transition-colors",
                checked && "border-cta bg-accent/50",
              )}
            >
              <Label htmlFor={id} className="flex cursor-pointer items-center gap-2 font-medium">
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={(on) => toggle(interest, on === true)}
                />
                {INTEREST_LABELS[interest]}
              </Label>
              {checked ? (
                <div
                  role="radiogroup"
                  aria-label={`Cuánto te interesa: ${INTEREST_LABELS[interest]}`}
                  className="bg-background grid grid-cols-3 gap-1 rounded-md p-0.5"
                >
                  {WEIGHTS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      role="radio"
                      aria-checked={weight === w}
                      onClick={() => update({ interests: { ...interests, [interest]: w } })}
                      className={cn(
                        "focus-visible:ring-ring/50 min-h-11 rounded px-2 text-xs outline-none focus-visible:ring-3 sm:min-h-8",
                        weight === w
                          ? "bg-cta text-cta-foreground"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {INTEREST_WEIGHT_LABELS[w]}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
