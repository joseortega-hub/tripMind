import type { Place } from "@/domain/place";

const INTERNET_LABELS: Record<string, string> = {
  wlan: "Wifi",
  yes: "Internet",
  wired: "Internet por cable",
  terminal: "Ordenador con internet",
  no: "Sin internet",
};

/** Servicios del alojamiento según sus etiquetas OSM (solo los que existen). */
export function lodgingServiceItems(place: Place): string[] {
  const lodging = place.lodging;
  if (!lodging) return [];
  const items: string[] = [];
  if (lodging.rooms) items.push(`${lodging.rooms} habitaciones`);
  if (lodging.internetAccess) {
    const label = INTERNET_LABELS[lodging.internetAccess] ?? `Internet (${lodging.internetAccess})`;
    items.push(
      lodging.internetAccess === "no"
        ? label
        : lodging.internetFee === false
          ? `${label} gratis`
          : lodging.internetFee
            ? `${label} de pago`
            : label,
    );
  }
  if (lodging.airConditioning !== undefined) {
    items.push(lodging.airConditioning ? "Aire acondicionado" : "Sin aire acondicionado");
  }
  if (lodging.swimmingPool) items.push("Piscina");
  if (lodging.bar) items.push("Bar");
  if (lodging.petsAllowed !== undefined) {
    items.push(lodging.petsAllowed ? "Admite mascotas" : "No admite mascotas");
  }
  if (lodging.smoking === "no") items.push("Sin humo");
  if (lodging.checkIn) items.push(`Entrada: ${lodging.checkIn}`);
  if (lodging.checkOut) items.push(`Salida: ${lodging.checkOut}`);
  if (lodging.brand) items.push(`Cadena: ${lodging.brand}`);
  return items;
}

export function LodgingServices({ place }: { place: Place }) {
  const items = lodgingServiceItems(place);
  const address = [
    [place.address?.street, place.address?.houseNumber].filter(Boolean).join(" "),
    place.address?.city,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">Según OpenStreetMap</p>
      {address ? <p className="text-sm">{address}</p> : null}
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li key={item} className="bg-muted rounded-md px-2 py-0.5 text-sm">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          OSM no registra servicios de este alojamiento. Consúltalos en su web o en los enlaces.
        </p>
      )}
      {place.phone ? <p className="text-sm">Teléfono: {place.phone}</p> : null}
    </div>
  );
}
