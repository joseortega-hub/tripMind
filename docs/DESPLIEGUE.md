# Despliegue en producción (Vercel + Neon)

Objetivo: una URL pública para probar TripMind en el móvil. Cada push a `main` se despliega solo.

## 1. Base de datos: Neon (gratis)
1. Crea cuenta en https://neon.tech (con GitHub) → *New project* → región **Frankfurt (eu-central-1)**.
2. En *Connect*, copia la cadena **con pooling** (host con `-pooler`), termina en `?sslmode=require`.
   Guárdala: es `DATABASE_URL`.

## 2. Hosting: Vercel (plan Hobby, gratis)
1. Crea cuenta en https://vercel.com con GitHub → *Add New → Project* → importa `joseortega-hub/tripMind`.
2. *Framework*: Next.js (autodetectado). *Install command*: `pnpm install`.
3. *Build command* (aplica las migraciones antes de compilar):
   ```
   pnpm prisma migrate deploy && pnpm build
   ```
4. *Root directory*: el de por defecto. Región de funciones: `fra1` (Settings → Functions).
5. Añade las variables de entorno (sección 3) **antes** del primer deploy y pulsa *Deploy*.

## 3. Variables de entorno (Settings → Environment Variables → Production)

| Variable | Valor | ¿Obligatoria? |
|---|---|---|
| `DATABASE_URL` | Cadena con pooling de Neon | Sí |
| `PROVIDERS_MODE` | `auto` (datos reales) o `demo` (solo Madrid grabado) | Sí |
| `CONTACT_EMAIL` | Un email tuyo de contacto. Nominatim, Overpass y Wikimedia lo exigen en el User-Agent; **sin él, todo cae a demo** | Sí para datos reales |
| `MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/liberty` | Sí |
| `GEOAPIFY_API_KEY` | Clave gratuita de https://myprojects.geoapify.com (autocompletado en español) | No (sin ella: Photon, nombres en inglés) |
| `OPENROUTESERVICE_API_KEY` | Clave gratuita de https://openrouteservice.org/dev/#/signup | No (sin ella se usa OSRM de FOSSGIS) |
| `TICKETMASTER_API_KEY` | Clave gratuita de https://developer.ticketmaster.com | No (Fase 9) |
| `ANTHROPIC_API_KEY` | Clave de https://console.anthropic.com | No (aún no se usa) |

Nunca con prefijo `NEXT_PUBLIC_`: todas se usan solo en el servidor.
`TRIPMIND_DB_PORT` y `GOOGLE_PLACES_API_KEY` no hacen falta en producción.

## 4. Probar en el móvil
- Abre la URL `https://<proyecto>.vercel.app` en el móvil; para usarla como app:
  Chrome → menú → *Añadir a pantalla de inicio* (Safari: Compartir → *Añadir a inicio*).

## 5. Precauciones
- **No hay login todavía**: quien tenga la URL puede crear viajes. No la publiques; para una
  demo, crea un viaje de prueba y comparte solo ese enlace.
- Las APIs abiertas (Nominatim, Overpass, OSRM de FOSSGIS, Transitous) piden uso moderado; la
  caché en BD lo reduce. Para tráfico real habrá que autoalojarlas o usar proveedores de pago.
- Los despliegues de *preview* (ramas/PR) usan las mismas variables solo si las marcas también
  para *Preview*.

## Problemas típicos
- **Error de Prisma en el build**: falta `DATABASE_URL` o no es la de pooling.
- **Todo sale como "datos de demostración"**: falta `CONTACT_EMAIL` o `PROVIDERS_MODE=demo`.
- **Mapa en blanco**: revisa `MAP_STYLE_URL` y que `public/vendor/` se generó en el `postinstall`.
