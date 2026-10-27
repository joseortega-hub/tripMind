import {
  FEEDBACK_MAX_IMAGE_CHARS,
  isTripId,
  type FeedbackContext,
  type FeedbackImage,
} from "@/domain";

/** Lado mayor de la imagen comprimida. */
export const FEEDBACK_MAX_SIDE = 1600;
/** Lados que se prueban si la imagen no cabe con ninguna calidad. */
const SIDES = [FEEDBACK_MAX_SIDE, 1200, 900];
/** Calidades que se prueban, de más a menos, hasta que la imagen cabe. */
const QUALITIES = [0.82, 0.7, 0.58, 0.45];

/** Tamaño que conserva la proporción y no pasa de `max` por el lado mayor (nunca amplía). */
export function fitWithin(width: number, height: number, max = FEEDBACK_MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Separa un data URL en tipo y base64. */
export function splitDataUrl(url: string): FeedbackImage | null {
  const match = /^data:(image\/(?:jpeg|webp|png));base64,(.+)$/.exec(url);
  return match ? { type: match[1] as FeedbackImage["type"], data: match[2]! } : null;
}

/**
 * Comprime una captura o foto: la reduce a {@link FEEDBACK_MAX_SIDE} px, la pasa a WebP (o JPEG
 * si el navegador no sabe) y baja la calidad hasta que cabe; si aun así no cabe, la reduce más.
 */
export async function compressImage(file: Blob): Promise<FeedbackImage> {
  if (!file.type.startsWith("image/")) throw new Error("Solo se pueden adjuntar imágenes.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("No se ha podido leer la imagen. Prueba con otra captura.");
  }
  try {
    for (const side of SIDES) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, side);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Tu navegador no puede preparar la imagen.");
      ctx.drawImage(bitmap, 0, 0, width, height);
      for (const quality of QUALITIES) {
        let image = splitDataUrl(canvas.toDataURL("image/webp", quality));
        if (!image || image.type !== "image/webp")
          image = splitDataUrl(canvas.toDataURL("image/jpeg", quality));
        if (image && image.data.length <= FEEDBACK_MAX_IMAGE_CHARS) return image;
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error("La imagen es demasiado grande incluso comprimida. Prueba con un recorte.");
}

/** Id del viaje si la ruta es `/trips/<id>…` ("/trips/new" no cuenta). */
export function tripIdFromPath(pathname: string): string | undefined {
  const [, first, second] = pathname.split("/");
  return first === "trips" && second && second !== "new" && isTripId(second)
    ? second.toLowerCase()
    : undefined;
}

/** Contexto automático: pantalla, modo y navegador. Nada personal (ni ubicación ni nombre). */
export function feedbackContext(): FeedbackContext {
  // El modo oscuro de la app va por la clase `dark` (globals.css).
  const dark = document.documentElement.classList.contains("dark");
  return {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: Math.round(window.devicePixelRatio * 100) / 100,
    mode: dark ? "oscuro" : "claro",
    browser: navigator.userAgent.slice(0, 300),
  };
}

const OPEN_EVENT = "tripmind:feedback";
/** Abre el buzón desde cualquier sitio (cabecera, menús…). */
export const openFeedback = () => window.dispatchEvent(new Event(OPEN_EVENT));
export const onOpenFeedback = (callback: () => void) => {
  window.addEventListener(OPEN_EVENT, callback);
  return () => window.removeEventListener(OPEN_EVENT, callback);
};
