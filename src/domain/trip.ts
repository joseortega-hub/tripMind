import { z } from "zod";
import { BookingLinkSchema, BookingRequirementSchema, BookingStatusSchema } from "./booking";
import { BudgetSchema, PriceSchema } from "./budget";
import { LatLngSchema } from "./geo";
import { GeocodeResultSchema } from "./geocoding";
import { ActivityPlanningSchema, ItineraryMetaSchema } from "./itinerary";
import { AddressSchema, PlaceSchema } from "./place";
import {
  AccommodationPreferencesSchema,
  IsoDateSchema,
  PaceSchema,
  PreferencesSchema,
  TimeOfDaySchema,
} from "./preferences";
import { SourceSchema } from "./source";

export const TravelersSchema = z.object({
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20).default(0),
});
export type Travelers = z.infer<typeof TravelersSchema>;

/**
 * Hotel del viaje: o bien un lugar real de un proveedor (`place`), o bien uno que el usuario
 * introduce a mano (sin `place`). Es el origen de rutas y distancias.
 */
export const HotelSchema = z.object({
  id: z.string().min(1),
  place: PlaceSchema.optional(),
  name: z.string().min(1),
  location: LatLngSchema,
  address: AddressSchema.optional(),
  checkIn: IsoDateSchema,
  checkOut: IsoDateSchema,
  price: PriceSchema.optional(),
  bookingStatus: BookingStatusSchema.default("pending"),
  bookingUrl: z.url().optional(),
});
export type Hotel = z.infer<typeof HotelSchema>;

export const ActivityKindSchema = z.enum(["visit", "meal", "event", "free_time", "custom"]);

export const ActivitySchema = z.object({
  id: z.string().min(1),
  kind: ActivityKindSchema,
  title: z.string().min(1),
  /** Lugar real asociado (snapshot del proveedor). Las actividades "custom" pueden no tenerlo. */
  place: PlaceSchema.optional(),
  startTime: TimeOfDaySchema.optional(),
  durationMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  /** Bloqueada: el optimizador no la mueve. */
  locked: z.boolean().default(false),
  bookingRequirement: BookingRequirementSchema.default("unverified"),
  bookingStatus: BookingStatusSchema.optional(),
  bookingLinks: z.array(BookingLinkSchema).default([]),
  price: PriceSchema.optional(),
  notes: z.string().max(2000).optional(),
  /** Datos del optimizador (franja, estimaciones, horario, avisos, alternativa). */
  planning: ActivityPlanningSchema.optional(),
});
export type Activity = z.infer<typeof ActivitySchema>;

export const TravelModeSchema = z.enum(["walk", "car", "transit", "bike"]);
export type TravelMode = z.infer<typeof TravelModeSchema>;

/**
 * Trayecto entre dos puntos. `routed` = ruta real de un proveedor (lleva `source` e `isDemo`);
 * `approximate` = línea recta calculada localmente, que la UI marca como aproximada (REQUISITOS §8).
 */
export const LegSchema = z
  .object({
    id: z.string().min(1),
    fromActivityId: z.string().optional(),
    toActivityId: z.string().optional(),
    from: LatLngSchema,
    to: LatLngSchema,
    mode: TravelModeSchema,
    quality: z.enum(["routed", "approximate"]),
    durationMinutes: z.number().nonnegative().optional(),
    distanceMeters: z.number().nonnegative().optional(),
    /** Geometría [lng, lat][] (orden GeoJSON). */
    geometry: z.array(z.tuple([z.number(), z.number()])).optional(),
    /** Enlace a un servicio externo de rutas como alternativa. */
    externalUrl: z.url().optional(),
    source: SourceSchema.optional(),
    isDemo: z.boolean().optional(),
    /**
     * Minutos que reserva el optimizador además de (o, sin ruta calculada, en lugar de) la duración
     * del proveedor: margen para tomar un taxi o, en un tramo aproximado, una estimación prudente.
     * Es una estimación local y la UI la presenta como tal.
     */
    reservedMinutes: z.number().nonnegative().optional(),
  })
  .refine(
    (leg) =>
      leg.quality === "approximate" || (leg.source !== undefined && leg.isDemo !== undefined),
    {
      message: "Una ruta real necesita source e isDemo",
      path: ["source"],
    },
  );
export type Leg = z.infer<typeof LegSchema>;

export const ItineraryDaySchema = z.object({
  id: z.string().min(1),
  date: IsoDateSchema,
  isRestDay: z.boolean().default(false),
  activities: z.array(ActivitySchema).default([]),
  legs: z.array(LegSchema).default([]),
});
export type ItineraryDay = z.infer<typeof ItineraryDaySchema>;

const tripFields = {
  title: z.string().min(1).max(120).optional(),
  destination: GeocodeResultSchema,
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  travelers: TravelersSchema,
  hotel: HotelSchema.optional(),
  accommodationPreferences: AccommodationPreferencesSchema.optional(),
  preferences: PreferencesSchema,
  pace: PaceSchema,
  budget: BudgetSchema,
};

const datesInOrder = (trip: { startDate: string; endDate: string }) =>
  trip.startDate <= trip.endDate;
const datesMessage = {
  message: "La fecha de salida no puede ser anterior a la de llegada",
  path: ["endDate"],
};

/** Datos que recoge el asistente para crear un viaje. */
export const TripInputSchema = z.object(tripFields).refine(datesInOrder, datesMessage);
export type TripInput = z.infer<typeof TripInputSchema>;

export const TripSchema = z
  .object({
    ...tripFields,
    id: z.string().min(1),
    days: z.array(ItineraryDaySchema).default([]),
    itineraryMeta: ItineraryMetaSchema.optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .refine(datesInOrder, datesMessage);
export type Trip = z.infer<typeof TripSchema>;

/** Ids generados por Prisma (`cuid`): evita consultar la BD con rutas arbitrarias. */
export const isTripId = (id: string) => /^[a-z0-9]{20,40}$/i.test(id);
