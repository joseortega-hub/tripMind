"use client";

import { BedDouble } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Place } from "@/domain/place";
import { cn } from "@/lib/utils";
import { useChooseHotel } from "./use-lodging";

/** En la ficha de un alojamiento: usarlo como hotel del viaje (centro del plan, §14A). */
export function ChooseHotel({
  tripId,
  place,
  isCurrent,
  headingLevel = 3,
}: {
  tripId: string;
  place: Place;
  isCurrent: boolean;
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const chooser = useChooseHotel(tripId);
  return (
    <section aria-labelledby="choose-hotel-title" className="flex flex-col gap-2 border-t pt-4">
      <Heading id="choose-hotel-title" className="font-medium">
        Tu hotel
      </Heading>
      {isCurrent ? (
        <p className="text-sm">
          Es tu hotel: el plan por días y los trayectos salen de aquí. Compara otros en la pestaña
          Hotel.
        </p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Si lo eliges, el itinerario se recalcula desde aquí (lo bloqueado se mantiene). Elegirlo
            no es una reserva.
          </p>
          <Button
            variant="cta"
            className="min-h-11 self-start"
            disabled={chooser.pendingId !== undefined}
            onClick={() => chooser.choose(place)}
          >
            <BedDouble aria-hidden />
            {chooser.pendingId ? "Guardando y recalculando…" : "Usar como mi hotel"}
          </Button>
        </>
      )}
      {chooser.message ? (
        <p
          role={chooser.message.tone === "error" ? "alert" : "status"}
          className={cn("text-sm", chooser.message.tone === "error" && "text-destructive")}
        >
          {chooser.message.text}
        </p>
      ) : null}
    </section>
  );
}
