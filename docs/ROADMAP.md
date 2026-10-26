# TripMind — Plan por fases

Cada fase se hace en **un chat nuevo** para ahorrar tokens. Al empezar un chat, pega el
"prompt de arranque" de la fase. Claude lee `CLAUDE.md` automáticamente y solo las secciones de
`docs/REQUISITOS.md` que necesita. Se hace **un commit por funcionalidad** y push a `main`.

Estado: ✅ hecho · 🔄 en curso · ⬜ pendiente

## Decisiones técnicas (y cambios respecto al prompt)

| Área | Elección | Motivo |
|---|---|---|
| Framework | Next.js 15 (App Router) + React 19 + TS estricto | Como pedía el prompt |
| UI | Tailwind CSS v4 + shadcn/ui (Radix) + lucide-react | Componentes accesibles, sin aspecto plantilla |
| Mapa | **MapLibre GL JS** vía `react-map-gl/maplibre` | Vectorial, clustering nativo, capas, heatmap y líneas; Leaflet necesita plugins para todo eso |
| Teselas | **OpenFreeMap** (sin clave, sin límite declarado) con fallback configurable (MapTiler/Stadia con clave) | Documentar atribución OSM obligatoria |
| Geocodificación | **Photon** (komoot, datos OSM) para autocompletado; Nominatim como respaldo | Nominatim prohíbe autocompletado en su servidor público |
| Lugares (POI) | **Overpass API** (OSM) + **Wikidata/Wikimedia Commons** (fotos, web oficial, horarios OSM) | Datos reales, abiertos y con fuente; sin clave |
| Opcional POI | Adaptador Google Places / Foursquare con clave | Valoraciones y precios reales solo si hay clave |
| Rutas a pie/coche | **OSRM** público (demo) → OpenRouteService con clave | Rutas reales; si fallan, línea "aproximada" + enlace externo |
| Transporte público | **Transitous (MOTIS)** API abierta basada en GTFS mundial | Planificación real con transbordos; si la ciudad no tiene feed → enlace oficial |
| Tiempo | **Open-Meteo** (sin clave) | Modo lluvia con previsión real (solo ≤16 días) |
| Eventos | **Ticketmaster Discovery API** (clave gratuita) | Eventos reales con fecha; sin clave → solo categorías |
| Hoteles | OSM (`tourism=hotel` etc.) + enlaces de búsqueda en Booking/Google Hotels con fechas. Adaptador para API de proveedor autorizado si se consigue acceso | Las APIs de precios reales requieren acuerdo comercial: no se simulan precios |
| Horarios | librería `opening_hours` (parser de OSM) | Validar si un lugar está abierto en una franja |
| Optimizador | Propio: clustering geográfico por día + vecino más cercano + 2-opt con ventanas horarias y actividades bloqueadas | Determinista, testeable, sin coste |
| IA (opcional) | Claude API para explicar/ajustar el plan, nunca como fuente de datos factuales | Evitar datos inventados |
| BD | PostgreSQL (Docker) + Prisma | Viajes, favoritos, estados de reserva; caché de respuestas de proveedores |
| Validación | Zod (formularios, API y respuestas de proveedores) | |
| Estado cliente | Zustand (viaje en edición) + TanStack Query (datos remotos) | |
| Drag & drop | dnd-kit | Reordenar itinerario |
| Tests | Vitest + Testing Library; Playwright E2E con proveedores en modo demo (fixtures) | CI sin red externa |
| Auth | Fuera del MVP (viajes por ID anónimo). Auth.js en una fase posterior | Evitar complejidad inicial |

**Modo demo**: cada proveedor tiene un adaptador real y uno `demo` que lee fixtures grabados de
respuestas reales (marcados `isDemo: true` y visibles en la UI con una etiqueta "Datos de demostración").

## Fases

### ✅ Fase 0 — Base del proyecto
Next.js + TS estricto + Tailwind + shadcn/ui + ESLint/Prettier + Vitest + Playwright + Docker
Postgres + Prisma inicial + `.env.example` + CI de GitHub Actions + docs.

### ✅ Fase 1 — Dominio y proveedores
Modelos de dominio (Trip, Place, Hotel, ItineraryDay, Activity, Leg, BookingStatus, Budget) con Zod;
esquema Prisma; interfaz `Provider` + registro + caché en BD + modo demo; adaptadores de
**geocodificación (Photon/Nominatim)** y **POIs (Overpass + Wikidata)**. Tests unitarios.
> Prompt: *"Fase 1 de docs/ROADMAP.md. Lee REQUISITOS §3. Implementa, prueba y haz commit por funcionalidad."*

Decisiones Fase 1:
- Dominio en `src/domain` (Zod 4). Los objetos anidados (preferencias, ritmo, presupuesto, snapshots
  de `Place`, precios, enlaces) se guardan como JSON en Prisma y se validan con esos esquemas.
- `Price` exige `origin` y, si viene de un proveedor, `source`; `unknown` no lleva importe.
  `Leg` `routed` exige `source`/`isDemo`; `approximate` es una línea recta que la UI marcará.
- Registro: `auto` usa real solo con `CONTACT_EMAIL` (política de Nominatim/Overpass/Wikimedia);
  un fallo real → 502 + enlace externo, nunca relleno con demo. Detalles en `docs/PROVEEDORES.md`.
- Caché en tabla `ProviderCache` con TTL; si la BD falla, la petición sigue sin caché.
- Fixtures demo grabados de respuestas reales (`scripts/record-fixtures.mts`): Madrid centro para
  lugares; Madrid y Barcelona para geocodificación.
- Docker: puerto del host configurable con `TRIPMIND_DB_PORT` (en esta máquina 5432 está ocupado).

### ⬜ Fase 2 — Asistente de creación de viaje
Wizard de 6 pasos (REQUISITOS §6) con autocompletado real, validación Zod, guardado en BD y
página de viaje `/trips/[id]`.

### ⬜ Fase 3 — Mapa central y layout
MapLibre + OpenFreeMap; layout 3 zonas / bottom sheet móvil; vistas mapa-lista-itinerario; capas
1–3 y 7, clustering, resaltado, ficha de lugar, favoritos. (REQUISITOS §5, §8)

### ⬜ Fase 4 — Rutas y transporte
Adaptadores OSRM/ORS (a pie, coche) y Transitous (público); matriz de tiempos con caché; capa 4
(estaciones/paradas OSM); comparador de modos; preguntas desde el hotel; enlaces de fallback. (§11)

### ⬜ Fase 5 — Itinerario y optimizador
Generación por días con franjas, horarios `opening_hours`, ritmo, comidas; edición manual con
dnd-kit, bloqueo, mover de día, "reorganizar resto del día"; capa 5 con ruta diaria. (§9)

### ⬜ Fase 6 — Hoteles
Búsqueda, puntuación configurable, ordenación, enlaces de disponibilidad; hotel como centro y
recálculo completo al cambiarlo. (§7, §14A)

### ⬜ Fase 7 — Restaurantes contextuales
Búsqueda junto a la actividad/hotel según franja; filtros; categorías de precio. (§10)

### ⬜ Fase 8 — Entradas, reservas y presupuesto
Estados informativos y manuales, prioridad de enlaces oficiales (Wikidata P856, OSM `website`),
capa 6; presupuesto acumulado con confirmado/orientativo/sin precio. (§12, §6.5)

### ⬜ Fase 9 — Descubrimiento y diferenciales
"Descubre algo diferente" + eventos Ticketmaster; mapa de calor de oportunidades; modo
"tengo 3 horas libres"; modo lluvia con Open-Meteo. (§13, §14) + resto del prompt pendiente.

### ⬜ Fase 10 — QA y entrega
E2E completos (escritorio/móvil), accesibilidad, rendimiento, estados vacíos/error, README final
con activación de cada proveedor y sus limitaciones/licencias.
