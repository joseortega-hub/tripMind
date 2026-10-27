import { type TripRouteContext, withTrip } from "@/server/api/trip-route";
import { buildCalendar } from "@/server/services/calendar";

export const runtime = "nodejs";

/**
 * GET /api/trips/[id]/calendar — calendario del destino en las fechas del viaje: festivos
 * (Nager.Date), cambios de hora (IANA), eventos (Ticketmaster si hay clave) y previsión
 * (Open-Meteo, solo dentro de su horizonte). Cada fuente lleva su estado; un fallo no tumba el resto.
 */
export async function GET(_request: Request, context: TripRouteContext) {
  return withTrip(context, async (trip) => Response.json(await buildCalendar(trip)));
}
