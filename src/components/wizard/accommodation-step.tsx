"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AccommodationPreferences } from "@/domain";
import { ACCOMMODATION_TYPE_LABELS, ZONE_LABELS } from "@/lib/trip-labels";
import { ChoiceGroup } from "./choice";
import { describedBy, Field, NativeSelect, parseOptionalNumber, Stepper } from "./field";
import { HotelPicker } from "./hotel-picker";
import type { StepProps } from "./steps";

const TYPES = Object.keys(ACCOMMODATION_TYPE_LABELS) as AccommodationPreferences["types"];
const ZONES = Object.keys(ZONE_LABELS) as AccommodationPreferences["zone"][];

export function AccommodationStep({ draft, update, errors }: StepProps) {
  const prefs = draft.accommodation;
  const setPrefs = (patch: Partial<AccommodationPreferences>) =>
    update({ accommodation: { ...prefs, ...patch } });

  return (
    <div className="flex flex-col gap-6">
      <ChoiceGroup
        id="hasHotel"
        label="¿Ya tienes alojamiento?"
        value={draft.hasHotel === undefined ? undefined : draft.hasHotel ? "yes" : "no"}
        error={errors.hasHotel}
        options={[
          {
            value: "yes",
            title: "Sí, ya lo tengo",
            description: "Lo usaremos como punto de partida de cada día.",
          },
          {
            value: "no",
            title: "Todavía no",
            description: "Dinos qué buscas y te ayudaremos a elegirlo.",
          },
        ]}
        onChange={(value) => update({ hasHotel: value === "yes" })}
      />

      {draft.hasHotel === true ? (
        <section aria-labelledby="hotel-heading" className="flex flex-col gap-3">
          <h3 id="hotel-heading" className="text-sm font-medium">
            Busca tu alojamiento
          </h3>
          <HotelPicker
            id="hotelPlace"
            destination={draft.destination}
            value={draft.hotelPlace}
            error={errors.hotelPlace}
            onChange={(hotelPlace) => update({ hotelPlace })}
          />
        </section>
      ) : null}

      {draft.hasHotel === false ? (
        <section aria-labelledby="prefs-heading" className="flex flex-col gap-5">
          <h3 id="prefs-heading" className="text-sm font-medium">
            ¿Qué tipo de alojamiento buscas?
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="budgetPerNight"
              label={`Presupuesto por noche (${draft.budget.currency})`}
              hint="Opcional. Para toda la habitación o el apartamento."
              error={errors["accommodation.budgetPerNight"]}
            >
              <Input
                id="budgetPerNight"
                type="number"
                inputMode="decimal"
                min={0}
                className="h-11 text-base sm:h-9 sm:text-sm"
                value={prefs.budgetPerNight ?? ""}
                onChange={(event) =>
                  setPrefs({ budgetPerNight: parseOptionalNumber(event.target.value) })
                }
                {...describedBy(
                  "budgetPerNight",
                  errors["accommodation.budgetPerNight"],
                  "Opcional",
                )}
              />
            </Field>
            <Field id="minStars" label="Categoría mínima">
              <NativeSelect
                id="minStars"
                value={prefs.minStars ?? ""}
                onChange={(event) =>
                  setPrefs({ minStars: parseOptionalNumber(event.target.value) })
                }
              >
                <option value="">Cualquiera</option>
                {[1, 2, 3, 4, 5].map((stars) => (
                  <option key={stars} value={stars}>
                    {stars} {stars === 1 ? "estrella" : "estrellas"} o más
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <Stepper
            id="rooms"
            label="Habitaciones"
            value={prefs.rooms}
            min={1}
            max={10}
            error={errors["accommodation.rooms"]}
            onChange={(rooms) => setPrefs({ rooms })}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Tipo (puedes elegir varios)</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TYPES.map((type) => {
                const checked = prefs.types.includes(type);
                return (
                  <Label
                    key={type}
                    htmlFor={`type-${type}`}
                    className="hover:bg-muted has-data-checked:border-primary flex cursor-pointer items-center gap-2 rounded-lg border p-3 font-normal"
                  >
                    <Checkbox
                      id={`type-${type}`}
                      checked={checked}
                      onCheckedChange={(next) =>
                        setPrefs({
                          types: next
                            ? [...prefs.types, type]
                            : prefs.types.filter((t) => t !== type),
                        })
                      }
                    />
                    {ACCOMMODATION_TYPE_LABELS[type]}
                  </Label>
                );
              })}
            </div>
          </fieldset>

          <ChoiceGroup
            id="zone"
            label="Zona preferida"
            columns={3}
            value={prefs.zone}
            options={ZONES.map((zone) => ({ value: zone, title: ZONE_LABELS[zone] }))}
            onChange={(zone) => setPrefs({ zone })}
          />

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <Label htmlFor="accessible" className="flex flex-col items-start gap-0.5 font-normal">
              <span className="font-medium">Accesible en silla de ruedas</span>
              <span className="text-muted-foreground text-xs">
                Priorizaremos alojamientos marcados como accesibles en la fuente.
              </span>
            </Label>
            <Switch
              id="accessible"
              checked={prefs.accessible}
              onCheckedChange={(accessible) => setPrefs({ accessible })}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
