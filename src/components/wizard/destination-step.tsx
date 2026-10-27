"use client";

import { Input } from "@/components/ui/input";
import { nightsBetween, tripDates, type WizardDraft } from "@/domain/wizard";
import { DestinationSearch } from "./destination-search";
import { describedBy, Field, Stepper } from "./field";
import type { StepProps } from "./steps";

/** Al cambiar fechas se descartan los días libres que quedan fuera del viaje. */
function withDates(draft: WizardDraft, startDate: string, endDate: string): Partial<WizardDraft> {
  const dates = tripDates(startDate, endDate);
  return {
    startDate,
    endDate,
    pace: { ...draft.pace, restDays: draft.pace.restDays.filter((day) => dates.includes(day)) },
  };
}

export function DestinationStep({ draft, update, errors }: StepProps) {
  const nights = nightsBetween(draft.startDate, draft.endDate);
  return (
    <div className="flex flex-col gap-6">
      <Field id="destination" label="¿A dónde vas?" error={errors.destination}>
        <DestinationSearch
          id="destination"
          value={draft.destination}
          error={errors.destination}
          onChange={(destination) =>
            update({
              destination,
              // Un hotel elegido en otro destino deja de tener sentido.
              hotelPlace: destination?.id === draft.destination?.id ? draft.hotelPlace : undefined,
            })
          }
        />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Fechas</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="startDate" label="Llegada" error={errors.startDate}>
            <Input
              id="startDate"
              type="date"
              className="h-11 text-base"
              value={draft.startDate}
              onChange={(event) => {
                const startDate = event.target.value;
                // Si la salida queda antes de la nueva llegada, se ajusta a la misma fecha.
                const endDate =
                  draft.endDate && startDate && draft.endDate < startDate
                    ? startDate
                    : draft.endDate;
                update(withDates(draft, startDate, endDate));
              }}
              {...describedBy("startDate", errors.startDate)}
            />
          </Field>
          <Field id="endDate" label="Salida" error={errors.endDate}>
            <Input
              id="endDate"
              type="date"
              className="h-11 text-base"
              min={draft.startDate || undefined}
              value={draft.endDate}
              onChange={(event) => update(withDates(draft, draft.startDate, event.target.value))}
              {...describedBy("endDate", errors.endDate)}
            />
          </Field>
        </div>
        {draft.startDate && draft.endDate && draft.startDate <= draft.endDate ? (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {nights === 0
              ? "Viaje de un día"
              : `${nights + 1} días · ${nights} ${nights === 1 ? "noche" : "noches"}`}
          </p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="mb-4 text-sm font-medium">Viajeros</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Stepper
            id="adults"
            label="Adultos"
            value={draft.travelers.adults}
            min={1}
            max={20}
            error={errors["travelers.adults"]}
            onChange={(adults) => update({ travelers: { ...draft.travelers, adults } })}
          />
          <Stepper
            id="children"
            label="Menores"
            hint="Menores de 18 años"
            value={draft.travelers.children}
            min={0}
            max={20}
            error={errors["travelers.children"]}
            onChange={(children) => update({ travelers: { ...draft.travelers, children } })}
          />
        </div>
      </fieldset>
    </div>
  );
}
