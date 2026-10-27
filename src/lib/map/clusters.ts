import Supercluster from "supercluster";
import type { BBox } from "@/domain/geo";
import type { MapLayerKey, MapPlace } from "./layers";

/** A partir de este zoom no se agrupa: al seleccionar un lugar se acerca hasta aquí. */
export const CLUSTER_MAX_ZOOM = 16;
export const SELECTION_ZOOM = CLUSTER_MAX_ZOOM + 1;

interface PointProps {
  id: string;
  layer: MapLayerKey;
}

export type MapMarker =
  | { kind: "place"; id: string; item: MapPlace; lng: number; lat: number }
  | {
      kind: "cluster";
      id: string;
      clusterId: number;
      count: number;
      lng: number;
      lat: number;
      /** Ids de los lugares agrupados, para resaltar el grupo que contiene la selección. */
      placeIds: string[];
    };

export interface ClusterIndex {
  markers(bounds: BBox, zoom: number): MapMarker[];
  /** Zoom al que el grupo se separa (para el clic en un grupo). */
  expansionZoom(clusterId: number): number;
}

export function buildClusterIndex(items: readonly MapPlace[], radius = 56): ClusterIndex {
  const byId = new Map(items.map((item) => [item.place.id, item]));
  const index = new Supercluster<PointProps>({ radius, maxZoom: CLUSTER_MAX_ZOOM });
  index.load(
    items.map((item) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [item.place.location.lng, item.place.location.lat],
      },
      properties: { id: item.place.id, layer: item.layer },
    })),
  );

  return {
    markers(bounds, zoom) {
      return index.getClusters(bounds, Math.round(zoom)).flatMap((feature): MapMarker[] => {
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        if ("cluster" in feature.properties && feature.properties.cluster) {
          const clusterId = feature.properties.cluster_id;
          return [
            {
              kind: "cluster",
              id: `cluster:${clusterId}`,
              clusterId,
              count: feature.properties.point_count,
              lng,
              lat,
              placeIds: index
                .getLeaves(clusterId, Infinity)
                .map((leaf) => (leaf.properties as PointProps).id),
            },
          ];
        }
        const id = (feature.properties as PointProps).id;
        const item = byId.get(id);
        return item ? [{ kind: "place", id, item, lng, lat }] : [];
      });
    },
    expansionZoom(clusterId) {
      return Math.min(index.getClusterExpansionZoom(clusterId), SELECTION_ZOOM);
    },
  };
}

/** ¿El marcador es (o contiene) el lugar seleccionado? */
export function markerHighlighted(marker: MapMarker, selectedId: string | undefined): boolean {
  if (!selectedId) return false;
  return marker.kind === "place" ? marker.id === selectedId : marker.placeIds.includes(selectedId);
}
