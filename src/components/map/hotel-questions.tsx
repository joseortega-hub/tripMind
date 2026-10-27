"use client";

import { BedDouble } from "lucide-react";
import type { Place } from "@/domain/place";
import type { Hotel } from "@/domain/trip";
import { NearbyTransit, WalkableFrom } from "./nearby-questions";

/** Preguntas desde el hotel (REQUISITOS §11): transporte cercano y qué queda a pie. */
export function HotelQuestions({
  hotel,
  tourism,
  onSelect,
}: {
  hotel: Hotel;
  tourism: Place[];
  onSelect: (place: Place) => void;
}) {
  return (
    <section
      aria-labelledby="hotel-questions-title"
      className="flex flex-col gap-2.5 border-b pb-4"
    >
      <div className="flex items-start gap-2.5">
        <BedDouble className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-col">
          <h3 id="hotel-questions-title" className="font-medium">
            Desde tu hotel
          </h3>
          <p className="text-muted-foreground text-sm">
            {hotel.name}. Abre cualquier lugar del mapa para ver cuánto tardas desde aquí.
          </p>
        </div>
      </div>
      <NearbyTransit at={hotel.location} onSelect={onSelect} />
      <WalkableFrom origin={hotel.location} candidates={tourism} onSelect={onSelect} />
    </section>
  );
}
