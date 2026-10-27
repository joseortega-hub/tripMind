# TripMind — Plan por fases

Cada fase se hace en **un chat nuevo** para ahorrar tokens. Al empezar un chat, pega el
"prompt de arranque" de la fase. Claude lee `CLAUDE.md` automáticamente y solo las secciones de
`docs/REQUISITOS.md` que necesita. Se hace **un commit por funcionalidad** y push a `main`.

Estado: ✅ hecho · 🔄 en curso · ⬜ pendiente

## Decisiones técnicas (y cambios respecto al prompt)

| Área               | Elección                                                                                                                                               | Motivo                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Framework          | Next.js 15 (App Router) + React 19 + TS estricto                                                                                                       | Como pedía el prompt                                                                          |
| UI                 | Tailwind CSS v4 + shadcn/ui (Radix) + lucide-react                                                                                                     | Componentes accesibles, sin aspecto plantilla                                                 |
| Mapa               | **MapLibre GL JS** vía `react-map-gl/maplibre`                                                                                                         | Vectorial, clustering nativo, capas, heatmap y líneas; Leaflet necesita plugins para todo eso |
| Teselas            | **OpenFreeMap** (sin clave, sin límite declarado) con fallback configurable (MapTiler/Stadia con clave)                                                | Documentar atribución OSM obligatoria                                                         |
| Geocodificación    | **Photon** (komoot, datos OSM) para autocompletado; Nominatim como respaldo                                                                            | Nominatim prohíbe autocompletado en su servidor público                                       |
| Lugares (POI)      | **Overpass API** (OSM) + **Wikidata/Wikimedia Commons** (fotos, web oficial, horarios OSM)                                                             | Datos reales, abiertos y con fuente; sin clave                                                |
| Opcional POI       | Adaptador Google Places / Foursquare con clave                                                                                                         | Valoraciones y precios reales solo si hay clave                                               |
| Rutas a pie/coche  | **OSRM** público (demo) → OpenRouteService con clave                                                                                                   | Rutas reales; si fallan, línea "aproximada" + enlace externo                                  |
| Transporte público | **Transitous (MOTIS)** API abierta basada en GTFS mundial                                                                                              | Planificación real con transbordos; si la ciudad no tiene feed → enlace oficial               |
| Tiempo             | **Open-Meteo** (sin clave)                                                                                                                             | Modo lluvia con previsión real (solo ≤16 días)                                                |
| Eventos            | **Ticketmaster Discovery API** (clave gratuita)                                                                                                        | Eventos reales con fecha; sin clave → solo categorías                                         |
| Hoteles            | OSM (`tourism=hotel` etc.) + enlaces de búsqueda en Booking/Google Hotels con fechas. Adaptador para API de proveedor autorizado si se consigue acceso | Las APIs de precios reales requieren acuerdo comercial: no se simulan precios                 |
| Horarios           | librería `opening_hours` (parser de OSM)                                                                                                               | Validar si un lugar está abierto en una franja                                                |
| Optimizador        | Propio: clustering geográfico por día + vecino más cercano + 2-opt con ventanas horarias y actividades bloqueadas                                      | Determinista, testeable, sin coste                                                            |
| IA (opcional)      | Claude API para explicar/ajustar el plan, nunca como fuente de datos factuales                                                                         | Evitar datos inventados                                                                       |
| BD                 | PostgreSQL (Docker) + Prisma                                                                                                                           | Viajes, favoritos, estados de reserva; caché de respuestas de proveedores                     |
| Validación         | Zod (formularios, API y respuestas de proveedores)                                                                                                     |                                                                                               |
| Estado cliente     | Zustand (viaje en edición) + TanStack Query (datos remotos)                                                                                            |                                                                                               |
| Drag & drop        | dnd-kit                                                                                                                                                | Reordenar itinerario                                                                          |
| Tests              | Vitest + Testing Library; Playwright E2E con proveedores en modo demo (fixtures)                                                                       | CI sin red externa                                                                            |
| Auth               | Fuera del MVP (viajes por ID anónimo). Auth.js en una fase posterior                                                                                   | Evitar complejidad inicial                                                                    |

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

> Prompt: _"Fase 1 de docs/ROADMAP.md. Lee REQUISITOS §3. Implementa, prueba y haz commit por funcionalidad."_

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

### ✅ Fase 2 — Asistente de creación de viaje

Wizard de 6 pasos (REQUISITOS §6) con autocompletado real, validación Zod, guardado en BD y
página de viaje `/trips/[id]`.

Decisiones Fase 2:

- Lógica del asistente en `src/domain/wizard.ts`: un esquema Zod por paso derivado de los del
  dominio, `validateStep`, `firstInvalidStep` y `buildTripInput` (borrador → `TripInput`). El ritmo
  se valida con las fechas (días libres dentro del viaje, al menos un día con actividades); las
  partidas del presupuesto no pueden superar el total. Viaje máximo de 60 días.
- Borrador en Zustand con `persist` (localStorage `tripmind:wizard-draft`, v1; otra versión se
  descarta). Se rehidrata tras montar para no romper la hidratación; se vacía al crear el viaje.
- Destino: combobox ARIA contra `/api/geocode?mode=autocomplete` (TanStack Query, 250 ms de espera).
- "Ya tengo hotel": alojamientos reales de la capa `lodging` de `/api/places` en ~4 × 4 km alrededor
  del centro del destino (máximo del endpoint) con filtro por nombre. Limitación: un hotel fuera de
  esa zona no aparece; el usuario puede seguir con "Todavía no". No hay alta manual de hoteles
  (exigiría coordenadas, que no se inventan): llegará con el mapa (Fase 3/6).
- Guardado con `POST /api/trips` (Zod → `src/server/services/trips.ts` → Prisma; 503
  `storage_unavailable` si falla la BD). Al leer se valida el JSON guardado con `TripSchema`.
  `/trips/[id]` es un Server Component con `loading`, `error` y `not-found`; muestra la etiqueta
  "Datos de demostración" si el destino o el hotel son demo, y reserva la zona del mapa/itinerario.
- Diseño (`docs/DISENO.md`): tokens petróleo `#1f5c6e` + coral `#a8432f` (variante de botón `cta`,
  solo acciones principales y selección) sobre `#fbfaf7`; Geist con cifras tabulares; navegación
  del asistente fija abajo en móvil con `safe-area-inset-bottom`; objetivos táctiles de 44 px;
  `prefers-reduced-motion`. Selects nativos (mejor en móvil). E2E con `@axe-core/playwright`
  (falla con infracciones graves o críticas de WCAG 2.2 AA).
- CI con servicio Postgres 17 y `prisma migrate deploy` antes de los E2E. `pg` como dependencia
  directa (Turbopack no la resolvía como paquete externo con pnpm).
- Vitest 5 marca como fallo un `vi.fn` que rechaza aunque el código capture el error: los tests
  simulan la BD caída con una función normal.
- Migración `20261026000000_init` registrada en `_prisma_migrations` (checksum SHA-256 del SQL,
  igual que `prisma migrate resolve --applied`) vía `psql` en el contenedor, porque desde el host la
  conexión TCP a Postgres falla con `EADDRINUSE` (sockets agotados en esta máquina).

### ✅ Fase 3 — Mapa central y layout

MapLibre + OpenFreeMap; layout 3 zonas / bottom sheet móvil; vistas mapa-lista-itinerario; capas
1–3 y 7, clustering, resaltado, ficha de lugar, favoritos. (REQUISITOS §5, §8)

Decisiones Fase 3:

- `react-map-gl/maplibre` + MapLibre 6 con el estilo de `MAP_STYLE_URL` (se lee en el servidor y
  se pasa como prop; no es secreto). El componente se carga con `next/dynamic` sin SSR. Turbopack no
  empaqueta el worker que MapLibre 6 carga con `import.meta.url`: `postinstall` lo copia a
  `public/vendor/` (ignorado en git) y se fija con `setWorkerUrl`.
- Atribución OSM/OpenMapTiles/OpenFreeMap siempre desplegada (`compact={false}`): arriba en móvil
  (abajo la tapa el sheet) y abajo a la derecha en tablet/escritorio. Sin WebGL o si falla el
  estilo: aviso con enlace a OpenStreetMap y la lista sigue funcionando con todo el destino.
- Lugares: una sola petición a `/api/places` (capas tourism, food, lodging; límite 500) en el área
  de ~4 × 4 km alrededor del destino (`areaAround`, compartida con el asistente); las capas se
  filtran en cliente. Si se alcanza el límite se avisa de que puede haber más.
- Agrupación con `supercluster` en JS y marcadores HTML (iconos lucide por capa, tokens
  `--layer-*` con contraste ≥ 5:1) en lugar de capas de símbolos de MapLibre: lógica testeable y
  marcadores con icono sin generar sprites. Sin agrupar a partir de zoom 17; seleccionar desde la
  lista acerca hasta ese zoom y resalta el marcador (aro coral) o el grupo que lo contiene.
- Los marcadores son `aria-hidden` y no entran en el orden de tabulación: la **lista** es la
  alternativa accesible y muestra exactamente lo mismo que el mapa (capas activas y zona visible;
  `placesInBounds`). Elegir en la lista centra el mapa; elegir en el mapa desplaza la lista.
- Capa 7 «Guardados»: tabla `Favorite` con snapshot `Place` (fuente e `isDemo`) por viaje.
  API `GET/POST /api/trips/[id]/favorites` y `DELETE …?placeId=` (los ids OSM llevan «/»).
  Un favorito se dibuja con el color de guardados si la capa está activa; si no, con el de su
  categoría y un corazón. Actualización optimista con TanStack Query y reversión si falla.
- Estado de la vista en Zustand por espacio de trabajo (`src/lib/map/store.ts`): capas,
  selección (con origen mapa/lista), vista móvil y altura del sheet. La distribución se elige con
  `matchMedia` (`useSyncExternalStore`; el servidor pinta la de móvil): móvil < 768 px, tablet
  hasta 1279 px, escritorio ≥ 1280 px.
- Móvil: sheet de tres alturas (pico 156 px, 50 %, completa) con asa arrastrable que también es
  un botón para cambiar de altura; elegir un lugar abre la ficha a media altura para que el lugar
  quede visible encima. Tablet: panel lateral plegable. Escritorio: panel (Lista · Itinerario ·
  Viaje) | mapa | ficha. El resumen del viaje pasa a la vista/pestaña «Viaje».
- Ficha: solo campos de la fuente (dirección, horario OSM sin interpretar y marcado «compruébalo»,
  teléfono, accesibilidad, estrellas OSM, web oficial de Wikidata o web de OSM), foto de Commons
  con autor y licencia vía `next/image` (`upload.wikimedia.org`, `thumb.wikimedia.org`).
- Pendiente: paneles redimensionables en escritorio (ahora anchos fijos) y el itinerario (Fase 5).

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
Calendario del destino: festivos (Nager.Date), eventos especiales con fuente y cambio de hora
(zona IANA) con avisos por día y su efecto en horarios del optimizador. (§17)
"Guardar desde TikTok/Instagram" (oEmbed + confirmación del lugar) y "Popular ahora" con
Wikimedia Pageviews. (§18)

### ⬜ Fase 10 — Exportación y compartir

PDF con Playwright desde `/trips/[id]/print`, `.html` interactivo autónomo, `.ics`, `.gpx`/`.kml`
y enlace de solo lectura. (§15)

### ⬜ Fase 11 — Demo Ticketdoor

Adaptador `tickets/ticketdoor` (interfaz + demo señalizado como propuesta), flujo "planifica tu día
alrededor de tu entrada" (`/plan?attraction&date&time`, entrada bloqueada en el itinerario) y
viaje demo pulido para la reunión. (§16, `docs/TICKETDOOR.md`)

### ⬜ Fase 12 — QA y entrega

E2E completos (escritorio/móvil), accesibilidad, rendimiento, estados vacíos/error, README final
con activación de cada proveedor y sus limitaciones/licencias.
