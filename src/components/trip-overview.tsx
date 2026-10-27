import { Accessibility, BedDouble, Heart, MapPin, Timer, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DataSource } from "@/components/data-source";
import type { Interest, TripInput, WizardStep } from "@/domain";
import { nightsBetween } from "@/domain/wizard";
import {
  ACCOMMODATION_TYPE_LABELS,
  BUDGET_CATEGORY_LABELS,
  formatDay,
  formatLongDate,
  formatMinutes,
  formatMoney,
  INTEREST_LABELS,
  INTEREST_WEIGHT_LABELS,
  PACE_LABELS,
  travelersText,
  ZONE_LABELS,
} from "@/lib/trip-labels";

type EditButton = (step: WizardStep, label: string) => React.ReactNode;

function Section({
  icon: Icon,
  title,
  step,
  renderEdit,
  children,
}: {
  icon: LucideIcon;
  title: string;
  step: WizardStep;
  renderEdit?: EditButton;
  children: React.ReactNode;
}) {
  return (
    <section className="flex gap-3 border-b py-4 last:border-b-0">
      <Icon className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">{title}</h3>
          {renderEdit?.(step, title)}
        </div>
        <div className="text-muted-foreground text-sm">{children}</div>
      </div>
    </section>
  );
}

/** Resumen de un viaje (paso 6 del asistente y cabecera de `/trips/[id]`). */
export function TripOverview({ trip, renderEdit }: { trip: TripInput; renderEdit?: EditButton }) {
  const nights = nightsBetween(trip.startDate, trip.endDate);
  const interests = Object.entries(trip.preferences.interests) as [Interest, number][];
  const prefs = trip.accommodationPreferences;
  const { budget, pace } = trip;
  const categories = Object.entries(budget.categories) as [
    keyof typeof BUDGET_CATEGORY_LABELS,
    number,
  ][];

  return (
    <div className="flex flex-col">
      <Section icon={MapPin} title="Destino y fechas" step="destination" renderEdit={renderEdit}>
        <p className="text-foreground">{trip.destination.label}</p>
        <p>
          Del {formatLongDate(trip.startDate)} al {formatLongDate(trip.endDate)} ·{" "}
          {nights === 0
            ? "1 día"
            : `${nights + 1} días, ${nights} ${nights === 1 ? "noche" : "noches"}`}
        </p>
        <p>{travelersText(trip.travelers)}</p>
        <DataSource source={trip.destination.source} isDemo={trip.destination.isDemo} />
      </Section>

      <Section icon={BedDouble} title="Alojamiento" step="accommodation" renderEdit={renderEdit}>
        {trip.hotel ? (
          <>
            <p className="text-foreground">{trip.hotel.name}</p>
            {trip.hotel.address?.street ? (
              <p>
                {[trip.hotel.address.street, trip.hotel.address.houseNumber]
                  .filter(Boolean)
                  .join(" ")}
              </p>
            ) : null}
            <p>Punto de partida de cada día</p>
            {trip.hotel.place ? (
              <DataSource source={trip.hotel.place.source} isDemo={trip.hotel.place.isDemo} />
            ) : null}
          </>
        ) : prefs ? (
          <ul className="flex flex-col gap-0.5">
            <li className="text-foreground">Aún sin alojamiento</li>
            <li>
              {prefs.rooms} {prefs.rooms === 1 ? "habitación" : "habitaciones"}
              {prefs.budgetPerNight !== undefined
                ? ` · hasta ${formatMoney(prefs.budgetPerNight, budget.currency)} por noche`
                : ""}
              {prefs.minStars ? ` · ${prefs.minStars}★ o más` : ""}
            </li>
            {prefs.types.length > 0 ? (
              <li>{prefs.types.map((type) => ACCOMMODATION_TYPE_LABELS[type]).join(", ")}</li>
            ) : null}
            <li>Zona: {ZONE_LABELS[prefs.zone].toLowerCase()}</li>
            {prefs.accessible ? (
              <li className="inline-flex items-center gap-1">
                <Accessibility className="size-3.5" aria-hidden /> Accesible en silla de ruedas
              </li>
            ) : null}
          </ul>
        ) : null}
      </Section>

      <Section icon={Heart} title="Intereses" step="interests" renderEdit={renderEdit}>
        <ul className="flex flex-wrap gap-1.5">
          {interests
            .sort((a, b) => b[1] - a[1])
            .map(([interest, weight]) => (
              <li
                key={interest}
                className="bg-background rounded-full border px-2.5 py-0.5 text-xs"
              >
                <span className="text-foreground">{INTEREST_LABELS[interest]}</span> ·{" "}
                {INTEREST_WEIGHT_LABELS[weight]?.toLowerCase()}
              </li>
            ))}
        </ul>
      </Section>

      <Section icon={Timer} title="Ritmo" step="pace" renderEdit={renderEdit}>
        <p className="text-foreground">{PACE_LABELS[pace.level].title}</p>
        <p>
          De {pace.dayStart} a {pace.dayEnd} · {formatMinutes(pace.lunchMinutes)} para comer
          {pace.freeTimeMinutes > 0 ? ` · ${formatMinutes(pace.freeTimeMinutes)} libres` : ""}
        </p>
        {pace.reducedMobility ? <p>Movilidad reducida</p> : null}
        {pace.restDays.length > 0 ? (
          <p>
            Sin actividades:{" "}
            <span className="capitalize">{pace.restDays.map(formatDay).join(", ")}</span>
          </p>
        ) : null}
      </Section>

      <Section icon={Wallet} title="Presupuesto" step="budget" renderEdit={renderEdit}>
        {budget.total === undefined && categories.length === 0 ? (
          <p>Sin presupuesto definido</p>
        ) : (
          <>
            {budget.total !== undefined ? (
              <p className="text-foreground">Total: {formatMoney(budget.total, budget.currency)}</p>
            ) : null}
            {categories.length > 0 ? (
              <p>
                {categories
                  .map(
                    ([category, amount]) =>
                      `${BUDGET_CATEGORY_LABELS[category]} ${formatMoney(amount, budget.currency)}`,
                  )
                  .join(" · ")}
              </p>
            ) : null}
          </>
        )}
      </Section>
    </div>
  );
}
