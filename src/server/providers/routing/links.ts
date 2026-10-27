import type { LatLng } from "@/domain/geo";
import type { ExternalRouteLink, RouteMode } from "@/domain/route";

const coord = ({ lat, lng }: LatLng) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

const GOOGLE_MODES: Record<RouteMode, string> = {
  walk: "walking",
  car: "driving",
  transit: "transit",
};

/** Motores de rutas de openstreetmap.org (los mismos servidores FOSSGIS que usa TripMind). */
const OSM_ENGINES: Partial<Record<RouteMode, string>> = {
  walk: "fossgis_osrm_foot",
  car: "fossgis_osrm_car",
};

/** URL pública documentada de Google Maps con origen, destino y modo ya puestos. */
export function googleMapsDirectionsUrl(from: LatLng, to: LatLng, mode: RouteMode) {
  const params = new URLSearchParams({
    api: "1",
    origin: coord(from),
    destination: coord(to),
    travelmode: GOOGLE_MODES[mode],
  });
  return `https://www.google.com/maps/dir/?${params}`;
}

export function osmDirectionsUrl(from: LatLng, to: LatLng, mode: RouteMode) {
  const engine = OSM_ENGINES[mode];
  if (!engine) return undefined;
  const params = new URLSearchParams({ engine, route: `${coord(from)};${coord(to)}` });
  return `https://www.openstreetmap.org/directions?${params}`;
}

/**
 * Enlaces externos para consultar el trayecto en otro servicio. Son enlaces, no rutas calculadas:
 * la UI los etiqueta como tales (REQUISITOS §11).
 */
export function externalRouteLinks(from: LatLng, to: LatLng, mode: RouteMode): ExternalRouteLink[] {
  const links: ExternalRouteLink[] = [
    { label: "Google Maps", url: googleMapsDirectionsUrl(from, to, mode) },
  ];
  const osm = osmDirectionsUrl(from, to, mode);
  if (osm) links.push({ label: "OpenStreetMap", url: osm });
  return links;
}
