"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Pace } from "@/domain";
import { tripDates } from "@/domain/wizard";
import { formatDay, formatMinutes, PACE_LABELS } from "@/lib/trip-labels";
import { ChoiceGroup } from "./choice";
import { describedBy, Field, NativeSelect } from "./field";
import type { StepProps } from "./steps";

const LEVELS = Object.keys(PACE_LABELS) as Pace["level"][];
const LUNCH_OPTIONS = [30, 45, 60, 90, 120];
const FREE_TIME_OPTIONS = [0, 30, 60, 90, 120, 180];

export function PaceStep({ draft, update, errors }: StepProps) {
  const { pace } = draft;
  const setPace = (patch: Partial<Pace>) => update({ pace: { ...pace, ...patch } });
  const dates = tripDates(draft.startDate, draft.endDate);
  const restError = errors["pace.restDays"];

  return (
    <div className="flex flex-col gap-6">
      <ChoiceGroup
        id="paceLevel"
        label="¿A qué ritmo quieres viajar?"
        columns={3}
        value={pace.level}
        options={LEVELS.map((level) => ({ value: level, ...PACE_LABELS[level] }))}
        onChange={(level) => setPace({ level })}
      />

      <fieldset>
        <legend className="mb-4 text-sm font-medium">Horario de cada día</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="dayStart" label="Empezar a las" error={errors["pace.dayStart"]}>
            <Input
              id="dayStart"
              type="time"
              className="h-11 text-base sm:h-9 sm:text-sm"
              value={pace.dayStart}
              onChange={(event) => setPace({ dayStart: event.target.value })}
              {...describedBy("dayStart", errors["pace.dayStart"])}
            />
          </Field>
          <Field id="dayEnd" label="Terminar a las" error={errors["pace.dayEnd"]}>
            <Input
              id="dayEnd"
              type="time"
              className="h-11 text-base sm:h-9 sm:text-sm"
              value={pace.dayEnd}
              onChange={(event) => setPace({ dayEnd: event.target.value })}
              {...describedBy("dayEnd", errors["pace.dayEnd"])}
            />
          </Field>
          <Field id="lunchMinutes" label="Tiempo para comer">
            <NativeSelect
              id="lunchMinutes"
              value={pace.lunchMinutes}
              onChange={(event) => setPace({ lunchMinutes: Number(event.target.value) })}
            >
              {LUNCH_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {formatMinutes(minutes)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="freeTimeMinutes" label="Tiempo libre al día">
            <NativeSelect
              id="freeTimeMinutes"
              value={pace.freeTimeMinutes}
              onChange={(event) => setPace({ freeTimeMinutes: Number(event.target.value) })}
            >
              {FREE_TIME_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? "Sin tiempo libre" : formatMinutes(minutes)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <Label htmlFor="reducedMobility" className="flex flex-col items-start gap-0.5 font-normal">
          <span className="font-medium">Movilidad reducida</span>
          <span className="text-muted-foreground text-xs">
            Menos caminatas largas y preferencia por lugares accesibles.
          </span>
        </Label>
        <Switch
          id="reducedMobility"
          checked={pace.reducedMobility}
          onCheckedChange={(reducedMobility) => setPace({ reducedMobility })}
        />
      </div>

      {dates.length > 1 ? (
        <fieldset aria-describedby={restError ? "restDays-error" : undefined}>
          <legend className="mb-1 text-sm font-medium">Días sin actividades (opcional)</legend>
          <p className="text-muted-foreground mb-3 text-xs">
            Para descansar o tener el día completamente libre.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {dates.map((date) => {
              const id = `rest-${date}`;
              return (
                <Label
                  key={date}
                  htmlFor={id}
                  className="hover:bg-muted has-data-checked:border-primary flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 font-normal capitalize"
                >
                  <Checkbox
                    id={id}
                    checked={pace.restDays.includes(date)}
                    onCheckedChange={(on) =>
                      setPace({
                        restDays: on
                          ? [...pace.restDays, date].sort()
                          : pace.restDays.filter((day) => day !== date),
                      })
                    }
                  />
                  {formatDay(date)}
                </Label>
              );
            })}
          </div>
          {restError ? (
            <p id="restDays-error" className="text-destructive mt-2 text-sm">
              {restError}
            </p>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );
}
