import type { FoodMoment, FoodNear, FoodQueryInput, FoodStyle } from "@/domain/food";
import type { LatLng } from "@/domain/geo";
import type { DietValue, FoodFacts, Place, PriceCategory } from "@/domain/place";

export const MOMENT_LABELS: Record<FoodMoment, string> = {
  breakfast: "Desayuno",
  lunch: "Comida",
  snack: "Merienda",
  dinner: "Cena",
};

export const NEAR_LABELS: Record<FoodNear, string> = {
  next: "Siguiente actividad",
  previous: "Actividad anterior",
  hotel: "Tu hotel",
  center: "Centro del destino",
};

export const STYLE_LABELS: Record<FoodStyle, string> = {
  any: "Cualquiera",
  local: "Cocina local",
  quick: "Rápida",
};

/** Categorías de precio de TripMind (REQUISITOS §10). */
export const PRICE_LABELS: Record<PriceCategory, string> = {
  budget: "Económico",
  mid: "Medio",
  special: "Especial",
  luxury: "Alta gama",
};

export const NO_PRICE = "Sin precio disponible";

/** Valores habituales de `cuisine` en OSM; el resto se muestra tal cual, legible. */
const CUISINE_LABELS: Record<string, string> = {
  spanish: "Española",
  tapas: "Tapas",
  regional: "Regional",
  basque: "Vasca",
  galician: "Gallega",
  andalusian: "Andaluza",
  asturian: "Asturiana",
  catalan: "Catalana",
  valencian: "Valenciana",
  mediterranean: "Mediterránea",
  italian: "Italiana",
  pizza: "Pizza",
  pasta: "Pasta",
  french: "Francesa",
  portuguese: "Portuguesa",
  greek: "Griega",
  japanese: "Japonesa",
  sushi: "Sushi",
  ramen: "Ramen",
  chinese: "China",
  noodle: "Fideos",
  korean: "Coreana",
  thai: "Tailandesa",
  vietnamese: "Vietnamita",
  indian: "India",
  nepalese: "Nepalí",
  pakistani: "Pakistaní",
  lebanese: "Libanesa",
  turkish: "Turca",
  kebab: "Kebab",
  arab: "Árabe",
  moroccan: "Marroquí",
  mexican: "Mexicana",
  peruvian: "Peruana",
  argentinian: "Argentina",
  venezuelan: "Venezolana",
  colombian: "Colombiana",
  latin_american: "Latinoamericana",
  american: "Americana",
  burger: "Hamburguesas",
  sandwich: "Bocadillos",
  chicken: "Pollo",
  steak_house: "Asador",
  grill: "Parrilla",
  seafood: "Marisco",
  fish: "Pescado",
  international: "Internacional",
  vegetarian: "Vegetariana",
  vegan: "Vegana",
  coffee_shop: "Café",
  breakfast: "Desayunos",
  brunch: "Brunch",
  cake: "Tartas",
  pastry: "Pastelería",
  bakery: "Panadería",
  churros: "Churros",
  ice_cream: "Helados",
  crepe: "Crepes",
  wine: "Vinos",
  beer: "Cervezas",
  cocktails: "Cócteles",
  healthy: "Saludable",
  juice: "Zumos",
  bubble_tea: "Bubble tea",
};

export function cuisineLabel(value: string) {
  const key = value.trim().toLowerCase();
  const known = CUISINE_LABELS[key];
  if (known) return known;
  const text = key.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const DIET_TEXT: Record<DietValue, string> = {
  only: "solo",
  yes: "con opciones",
  limited: "algunas opciones",
  no: "sin opciones",
};

/** "Vegetariano: solo · Vegano: con opciones" (según OSM). */
export function dietText(food: FoodFacts | undefined) {
  const parts: string[] = [];
  if (food?.vegetarian) parts.push(`vegetariano ${DIET_TEXT[food.vegetarian]}`);
  if (food?.vegan) parts.push(`vegano ${DIET_TEXT[food.vegan]}`);
  if (food?.glutenFree) parts.push(`sin gluten ${DIET_TEXT[food.glutenFree]}`);
  if (parts.length === 0) return undefined;
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const RESERVATION_LABELS: Record<NonNullable<FoodFacts["reservation"]>, string> = {
  yes: "Acepta reservas",
  recommended: "Reserva recomendada",
  required: "Reserva obligatoria",
  no: "No acepta reservas",
};

export function priceText(place: Place) {
  const price = place.food?.price;
  return price ? `${PRICE_LABELS[price.category]} (${price.raw} según OSM)` : NO_PRICE;
}

export function foodQueryString(query: FoodQueryInput) {
  const params = new URLSearchParams({ date: query.date, moment: query.moment });
  if (query.near) params.set("near", query.near);
  if (query.cuisine) params.set("cuisine", query.cuisine);
  if (query.diet) params.set("diet", query.diet);
  if (query.terrace) params.set("terrace", "1");
  if (query.maxMinutes) params.set("maxMinutes", String(query.maxMinutes));
  if (query.style && query.style !== "any") params.set("style", query.style);
  return params.toString();
}

const coord = ({ lat, lng }: LatLng) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

/** Indicaciones a pie en Google Maps (URL pública documentada) desde la referencia elegida. */
export const walkingDirectionsUrl = (from: LatLng, to: LatLng) =>
  `https://www.google.com/maps/dir/?${new URLSearchParams({
    api: "1",
    origin: coord(from),
    destination: coord(to),
    travelmode: "walking",
  })}`;
