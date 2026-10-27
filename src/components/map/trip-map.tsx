"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { Heart } from "lucide-react";
import { getVersion, setWorkerUrl } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  AttributionControl,
  type MapRef,
  Marker,
  NavigationControl,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import type { BBox, LatLng } from "@/domain/geo";
import { buildClusterIndex, markerHighlighted, SELECTION_ZOOM } from "@/lib/map/clusters";
import type { MapPlace } from "@/lib/map/layers";
import { cn } from "@/lib/utils";
import { LAYER_BG, LAYER_ICONS } from "./layer-style";
import { useMapUi } from "./workspace-context";

// Worker servido desde `public/vendor` (lo copia `scripts/copy-maplibre-worker.mjs`).
setWorkerUrl(`/vendor/maplibre-gl-worker.mjs?v=${getVersion()}`);

/** Textos de los controles de MapLibre en español. */
const LOCALE = {
  "Map.Title": "Mapa del viaje",
  "NavigationControl.ZoomIn": "Acercar",
  "NavigationControl.ZoomOut": "Alejar",
  "NavigationControl.ResetBearing": "Orientar al norte",
  "AttributionControl.ToggleAttribution": "Mostrar u ocultar la atribución",
  "AttributionControl.MapFeedback": "Corregir el mapa",
};

const INITIAL_ZOOM = 14;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface TripMapProps {
  center: LatLng;
  /** Área de los lugares (oeste, sur, este, norte) para encuadrar al recentrar. */
  area: BBox;
  items: MapPlace[];
  styleUrl: string;
  /** Margen inferior ocupado por el bottom sheet en móvil, para centrar lo visible. */
  bottomInset?: number;
  onFailure: (reason: "style" | "webgl") => void;
}

function readBounds(map: MapRef): BBox {
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

export default function TripMap({
  center,
  area,
  items,
  styleUrl,
  bottomInset = 0,
  onFailure,
}: TripMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [view, setView] = useState<{ bounds?: BBox; zoom: number }>({ zoom: INITIAL_ZOOM });
  const selectedId = useMapUi((state) => state.selectedId);
  const selectionOrigin = useMapUi((state) => state.selectionOrigin);
  const focusRequest = useMapUi((state) => state.focusRequest);
  const recenterRequest = useMapUi((state) => state.recenterRequest);
  const select = useMapUi((state) => state.select);
  const setBounds = useMapUi((state) => state.setBounds);

  const index = useMemo(() => buildClusterIndex(items), [items]);
  const markers = useMemo(
    () => (view.bounds ? index.markers(view.bounds, view.zoom) : []),
    [index, view],
  );

  const sync = useCallback(
    (event?: ViewStateChangeEvent) => {
      const map = mapRef.current;
      if (!map) return;
      const bounds = readBounds(map);
      setView({ bounds, zoom: event?.viewState.zoom ?? map.getZoom() });
      setBounds(bounds);
    },
    [setBounds],
  );

  const padding = useMemo(
    () => ({ top: 64, left: 32, right: 32, bottom: bottomInset + 32 }),
    [bottomInset],
  );

  // Selección desde la lista → centrar el mapa en el lugar y acercar hasta separarlo del grupo.
  const selected = items.find((item) => item.place.id === selectedId);
  const selectedLocation = selected?.place.location;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectionOrigin !== "list" || !selectedLocation) return;
    map.flyTo({
      center: [selectedLocation.lng, selectedLocation.lat],
      zoom: Math.max(map.getZoom(), SELECTION_ZOOM),
      padding,
      animate: !prefersReducedMotion(),
    });
    // Solo al pedir un nuevo centrado; no al mover el sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  useEffect(() => {
    if (recenterRequest === 0) return;
    mapRef.current?.fitBounds(area, { padding, animate: !prefersReducedMotion() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterRequest]);

  return (
    <Map
      ref={mapRef}
      mapStyle={styleUrl}
      initialViewState={{ longitude: center.lng, latitude: center.lat, zoom: INITIAL_ZOOM }}
      minZoom={3}
      maxZoom={19}
      locale={LOCALE}
      attributionControl={false}
      style={{ position: "absolute", inset: 0 }}
      onLoad={() => sync()}
      onMoveEnd={sync}
      onClick={() => select(undefined, "map")}
      onError={(event) => {
        // Los fallos de una tesela suelta no impiden usar el mapa; sí el del estilo.
        const message = String(event.error?.message ?? "");
        if (!mapRef.current?.isStyleLoaded() && /style|fetch|Failed/i.test(message)) {
          onFailure("style");
        }
      }}
    >
      <AttributionControl position="top-right" compact={false} />
      <NavigationControl position="top-right" showCompass={false} />
      {markers.map((marker) => {
        const highlighted = markerHighlighted(marker, selectedId);
        if (marker.kind === "cluster") {
          const size = marker.count < 10 ? 36 : marker.count < 50 ? 42 : 48;
          return (
            <Marker
              key={marker.id}
              longitude={marker.lng}
              latitude={marker.lat}
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                mapRef.current?.easeTo({
                  center: [marker.lng, marker.lat],
                  zoom: index.expansionZoom(marker.clusterId),
                  animate: !prefersReducedMotion(),
                });
              }}
            >
              <div
                aria-hidden
                data-testid="map-cluster"
                style={{ width: size, height: size }}
                className={cn(
                  "bg-primary text-primary-foreground flex cursor-pointer items-center justify-center rounded-full border-2 border-white text-sm font-semibold shadow-md",
                  highlighted && "ring-cta ring-3 ring-offset-1",
                )}
              >
                {marker.count}
              </div>
            </Marker>
          );
        }
        const Icon = LAYER_ICONS[marker.item.layer];
        return (
          <Marker
            key={marker.id}
            longitude={marker.lng}
            latitude={marker.lat}
            anchor="bottom"
            style={{ zIndex: highlighted ? 2 : 1 }}
            onClick={(event) => {
              event.originalEvent.stopPropagation();
              select(marker.id, "map");
            }}
          >
            <div
              aria-hidden
              data-testid="map-marker"
              data-place-id={marker.id}
              data-selected={highlighted || undefined}
              title={marker.item.place.name}
              className="flex cursor-pointer flex-col items-center"
            >
              <span
                className={cn(
                  "text-layer-foreground relative flex items-center justify-center rounded-full border-2 border-white shadow-md transition-transform",
                  LAYER_BG[marker.item.layer],
                  highlighted ? "ring-cta size-10 ring-3" : "size-8",
                )}
              >
                <Icon className={highlighted ? "size-5" : "size-4"} strokeWidth={2.25} />
                {marker.item.isFavorite && marker.item.layer !== "saved" ? (
                  <Heart className="bg-layer-saved absolute -top-1 -right-1 size-3.5 rounded-full fill-white p-0.5 text-white" />
                ) : null}
              </span>
              <span
                className={cn(
                  "-mt-0.5 h-2 w-0.5 rounded-b",
                  highlighted ? "bg-cta" : LAYER_BG[marker.item.layer],
                )}
              />
            </div>
          </Marker>
        );
      })}
    </Map>
  );
}
