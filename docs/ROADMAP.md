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

### ✅ Fase 4 — Rutas y transporte

Adaptadores OSRM/ORS (a pie, coche) y Transitous (público); matriz de tiempos con caché; capa 4
(estaciones/paradas OSM); comparador de modos; preguntas desde el hotel; enlaces de fallback. (§11)

Decisiones Fase 4:

- Dominio en `src/domain/route.ts`: `RouteResult` = `routed` (duración, distancia, geometría,
  fuente, `isDemo`; en transporte público salida/llegada, transbordos y tramos con línea, colores y
  operador del feed GTFS) o `approximate` (línea recta, motivo y enlaces externos, **sin
  duración**). `TravelMatrix` para el optimizador: tiempos por par o `unavailable` con solo la
  distancia en línea recta.
- Rutas: OSRM de **FOSSGIS** (`routing.openstreetmap.de`, perfiles reales `routed-foot` y
  `routed-car`, 1 req/s) en vez del demo de project-osrm.org, que solo calcula en coche aunque se
  pida `foot`. Con `OPENROUTESERVICE_API_KEY`, ORS (clave en cabecera, solo servidor). Caché 7 días;
  la matriz envía cada punto una vez (máx. 100 puntos únicos).
- Transporte público: Transitous con `fastestDirectFactor=1.5` (el comparador ya enseña la opción a
  pie) y el itinerario que llega antes; caché 6 h. Comprobado: en Madrid solo tiene Cercanías e
  interurbanos (sin Metro ni EMT), así que en el centro casi siempre gana andar y se dice así.
- Hora de salida: día del viaje + hora local; zona IANA con `@photostructure/tz-lookup` y desfase
  real de ese día. La demo devuelve el plan grabado con sus horas reales y la UI indica la fecha.
- Fallos: cada modo es independiente; un fallo o falta de cobertura devuelve `approximate` con
  enlaces a Google Maps y openstreetmap.org con origen y destino, etiquetados como enlaces externos
  (no ruta calculada); el mapa dibuja la recta discontinua. Sin precio de taxi (no hay fuente).
- Capa 4: categorías `tram_stop` y `bus_stop` y `Place.transit` (líneas `route_ref`, red,
  operador de OSM, marcadas como etiquetas del mapa, no horarios). Se piden aparte y solo al
  activar la capa (apagada por defecto: cientos de paradas). Token `--layer-transport` + icono.
- Ficha de lugar: «Cómo llegar» (desde el hotel o desde el lugar abierto antes; día y hora de
  salida; transporte público con franja de tramos proporcional y lista accesible, a pie, taxi o
  coche; «Ver en el mapa» dibuja la ruta y encuadra), «¿Hay metro o transporte cerca?» (≤ 800 m,
  tiempo a pie real a las más cercanas de cada tipo) y «¿Qué puedo visitar a pie?» (≤ N min según
  la matriz). En «Viaje», «Desde tu hotel» con las dos preguntas.
- Fixtures demo (`scripts/record-route-fixtures.mts`): paradas de Overpass, rutas OSRM desde Hotel
  México a 70 lugares y 18 estaciones, matrices 71×71 (pie, coche) y 71×18, y 57 planes de
  Transitous del 28-10-2026 a las 10:00 (8 con Cercanías, p. ej. a Sol).
- Pendiente: transporte público en la matriz (Transitous pide uso ligero de `/plan`; se decidirá
  en la Fase 5), enlaces a webs oficiales de operadores, frecuencia y tarifas (sin fuente fiable).

### ✅ Fase 5 — Itinerario y optimizador

Generación por días con franjas, horarios `opening_hours`, ritmo, comidas; edición manual con
dnd-kit, bloqueo, mover de día, "reorganizar resto del día"; capa 5 con ruta diaria. (§9)

Decisiones Fase 5:

- Arreglo heredado: `/api/places` ordena por relevancia antes de recortar (`pois/ranking.ts`:
  capa turística, Wikidata, Wikipedia, imagen, web oficial; señales de la fuente, no
  valoraciones). El adaptador real pide hasta 2000 elementos a Overpass (que recorta en orden
  geográfico) y recorta después. El Museo del Prado ya entra en los 500 de la demo.
- Optimizador puro y determinista en `src/server/services/itinerary/` (`optimizer.ts`): candidatos
  de las categorías visitables (museo, galería, monumento, atracción, mirador, parque, templo; los
  teatros esperan a la cartelera de eventos) puntuados por intereses con peso + señales de la
  fuente; reparto por días con **barrido angular** alrededor del hotel (empieza tras el mayor
  hueco); por día, vecino más cercano + 2-opt y búsqueda local (reubicar y 2-opt) evaluando la
  secuencia programada completa; cada visita entra solo si el día sigue sin avisos. Segunda pasada
  con lo que no cupo en los días con hueco más cercanos. Ritmo: 3 / 5 / 7 visitas, margen de
  15 / 10 / 5 min y duraciones ×1,15 / ×1 / ×0,85.
- Las horas se calculan en secuencia con los tiempos reales: un plan generado sin avisos es
  realizable. Las ediciones manuales nunca descartan actividades: si algo no encaja, la
  actividad lleva su aviso (llegada tarde a una hora fijada, cerrado a esa hora, fuera del día,
  comida fuera de franja).
- Horarios con `opening_hours` (LGPL-3.0) evaluados en la hora de pared del destino (fechas
  construidas con componentes locales, sin depender de la zona del servidor); festivos `PH` con
  el país del destino. Nunca se programa en horario confirmado cerrado; sin horario, ilegible o
  con estado `unknown` → "pendiente de confirmar". "Alternativa si está cerrado": lugar a ≤ 1 km
  con horario confirmado abierto en esa franja.
- Duraciones por categoría (más en lugares con Wikidata + Wikipedia) marcadas como estimación.
  Franjas reservadas sin restaurante (Fase 7): desayuno 30 min si el día empieza ≤ 10:00, comida
  13:00–15:00 con la duración del asistente, tiempo libre desde las 16:00 y cena 20:30–22:00 si
  cabe antes del fin del día.
- Tiempos: matrices a pie y en coche de la Fase 4 (≤ 100 puntos: hotel + hasta 99 candidatos).
  A pie hasta 25 min (12 con movilidad reducida, +50 % de margen); si no, taxi/coche con 10 min
  de margen. **Transporte público fuera del optimizador**: Transitous pide uso ligero de `/plan`
  (un plan de 3 días son decenas de tramos) y en Madrid no tiene Metro ni EMT; se consulta por
  tramo con el comparador de la ficha. Sin tiempos calculados el tramo queda `approximate`, sin
  duración, y se reserva un margen prudente (línea recta × 1,4 a 4,5 km/h) etiquetado como
  estimación (`Leg.reservedMinutes`), con enlace a Google Maps. En demo solo se planifican los 70
  lugares con trayectos grabados desde Hotel México.
- Persistencia: migración `20261027000000_itinerary` (`Activity.planning`, `Leg.reservedMinutes`,
  `Trip.itineraryMeta`). Regenerar conserva lo bloqueado en su día y hora; cada edición recalcula y
  guarda solo los días afectados. API `GET|POST|PATCH /api/trips/[id]/itinerary`.
- UI: pestaña Itinerario (escritorio/tablet) y vista del sheet en móvil: selector de días, tramos
  con tiempo, distancia y modo, y por actividad hora, duración, horario, precio ("sin precio"),
  reserva ("sin verificar"), web y alternativa. Fijar hora = bloquear. Reordenar arrastrando
  (dnd-kit, solo puntero) o con **flechas en el asa** y botones Antes/Después: el sensor de
  teclado de dnd-kit fallaba con filas de alturas distintas. Mover de día, quitar, añadir desde la
  ficha o desde "Se quedaron fuera" y "Reorganizar lo que viene después".
- Capa 5: paradas numeradas (cuadros blancos con borde petróleo, distintos de los grupos) con el
  hotel de referencia y la línea discontinua del **orden de visita** (no es el trazado de calles:
  pedir una ruta por tramo a FOSSGIS, 1 req/s, haría lenta la generación). Visible por defecto con
  botón para ocultarla; elegir una actividad abre su ficha y centra el mapa.
- Pendiente: trazado real por tramo bajo demanda, transporte público en la matriz si hay
  proveedor con cuota, horarios de llegada/salida del primer y último día, paneles
  redimensionables.

### ✅ Fase 6 — Hoteles

Búsqueda, puntuación configurable, ordenación, enlaces de disponibilidad; hotel como centro y
recálculo completo al cambiarlo. (§7, §14A)

Decisiones Fase 6:

- Búsqueda (`src/server/services/lodging.ts`, `GET /api/trips/[id]/lodging`): capa `lodging` de
  OSM en el área del destino; filtros estrictos del paso 2 en el servidor (tipo, estrellas OSM
  mínimas —sin `stars` no pasa—, solo `wheelchair=yes`). Se comparan los 40 más cercanos en línea
  recta a los puntos clave (más el hotel actual siempre, aunque no cumpla los filtros) y se dice
  cuántos cumplen y cuántos hay en la zona. Puntos clave: hasta 12 visitas del itinerario
  repartidas entre los días o, sin plan, los 12 lugares más relevantes del destino.
- Distancias con la matriz a pie de la Fase 4 (hoteles × puntos clave y hoteles × las dos
  estaciones más cercanas a ≤ 1,5 km: metro, tren, tranvía y estación de autobuses; las paradas
  de autobús no cuentan). Dos llamadas a la matriz por búsqueda, con caché.
- Puntuación pura en el cliente (`src/lib/lodging/score.ts`, pesos 0–5 recordados en
  `localStorage`): presupuesto (solo con precio de proveedor), cerca del itinerario (media de
  minutos a pie, 8 → 35), transporte (estación 3 → 15 min) y preferencias (tipo, estrellas,
  accesibilidad, zona céntrica por distancia al centro o bien comunicada = transporte). Un
  componente sin datos no cuenta; sin estación cercana el transporte vale 0. Si a algún candidato
  le faltan tiempos, **todos** se comparan en línea recta y se indica. Ordenar por puntuación,
  ubicación, transporte y ubicación/transporte; precio y valoración aparecen deshabilitados.
- Sin precios, valoraciones ni disponibilidad: interfaz `LodgingPriceProvider`
  (`src/server/providers/lodging/`) con solo el adaptador "no configurado". Enlaces de búsqueda
  etiquetados como externos y no reserva: Booking (fechas, adultos, menores y habitaciones en la
  URL pública de resultados) y Google Hotels (solo nombre y ciudad: no documenta parámetros de
  fecha, la UI lo dice). Servicios OSM en `Place.lodging` (habitaciones, wifi, aire, piscina…).
- Hotel como centro (§14A): `PUT /api/trips/[id]/hotel { place }` guarda el snapshot (noches del
  viaje, reserva pendiente, sin precio) y, si hay plan, lo regenera conservando lo bloqueado; si el
  recálculo falla el hotel queda guardado y se avisa. El cliente actualiza el itinerario, vuelve a
  medir y refresca el viaje (preguntas «Desde tu hotel», «Cómo llegar», mapa). También se elige
  desde la ficha de cualquier alojamiento. «Ya tengo hotel» del asistente sigue igual y ese hotel
  aparece como «Tu hotel» en la comparación.
- UI: pestaña «Hotel» en escritorio/tablet y quinta vista del sheet móvil. «Tu hotel» con borde
  coral; lista con puntuación, barra apilada por componente (con leyenda) y desglose en
  «Detalles». Botón de elegir en contorno en la lista (el coral, solo en la ficha) para no
  repetir 40 acciones principales.
- Demo: `routing/fixtures/lodging.json` con matrices reales de FOSSGIS desde los 78 alojamientos
  del fixture (a pie a 70 lugares y 18 estaciones; ida y vuelta a pie y en coche), grabadas con
  `scripts/record-lodging-fixtures.mts`. La matriz demo ahora compone celdas de todas las tablas,
  así que cambiar de hotel en demo sigue teniendo tiempos reales.
- Arreglo heredado: generar el itinerario de un viaje sin hotel fallaba (vuelta a un hotel
  inexistente).
- Pendiente: proveedor autorizado de precios (requiere acuerdo), alta manual de un hotel fuera de
  la zona de ~4 × 4 km, filtro "abierto/cancelación" (sin fuente) y paneles redimensionables.

### ✅ Fase 7 — Restaurantes contextuales

Búsqueda junto a la actividad/hotel según franja; filtros; categorías de precio. (§10)

Decisiones Fase 7:

- Datos: capa `food` de OSM ampliada con `ice_cream`, `food_court` y `marketplace`. `Place.food`
  guarda solo etiquetas reales: `diet:vegetarian|vegan|gluten_free`, `outdoor_seating` (terraza;
  cualquier valor salvo `no`), `takeaway`, `reservation`, `reservation:website`/`website:booking`
  (único enlace de reserva) y `website:menu` (enlace a la carta del local; no se muestran menús).
- Precio: Económico / Medio / Especial / Alta gama solo si OSM publica `price_range`/`price:range`
  como 1–4 símbolos de moneda (en Madrid centro, ninguno); si no, "Sin precio disponible".
  Valoraciones: interfaz `FoodRatingsProvider` (`src/server/providers/food/`) con solo el
  adaptador "no configurado".
- Contexto (`src/server/services/food/context.ts`): la franja de desayuno/comida/cena del día da
  hora y duración, y las referencias son la actividad con lugar anterior y la siguiente, más el
  hotel; la merienda (sin franja) usa 17:30 y las actividades de antes y después de esa hora. Sin
  plan ni hotel, el centro del destino.
- Búsqueda (`GET /api/trips/[id]/food`): Overpass en un radio de 1 km de cada referencia (bbox en
  rejilla, caché). Horario con la librería `opening_hours` durante toda la comida: los cerrados
  confirmados se ocultan (y se cuentan); sin horario o dudoso → "pendiente de confirmar". Se miden
  con la matriz a pie los 25 más cercanos a cada referencia (desde la anterior y el hotel; hasta la
  siguiente). Orden: primero con tiempo (minutos + 5 si el horario está pendiente) y después, en
  línea recta y marcados, los que no tienen tiempo. La comparación de referencias da cuántos
  quedan a ≤ 10 min ("N o más": solo se mide lo cercano) y el más cercano.
- Filtros: momento, cocina (facetas de `cuisine`), dieta (vegano cuenta como vegetariano; `limited`
  cuenta), terraza, tiempo máximo (sin tiempo calculado, línea recta a 60 m/min) y estilo: "cocina
  local" (= `cuisine` regional o del país, lista por país) o "rápida" (`fast_food`, `food_court`,
  `takeaway=only`).
- Itinerario: nueva edición `set_meal_place` (lugar o `null`). La comida sigue siendo un bloque
  con su ventana horaria, pero con tramos hasta el sitio y desde él, primera hora abierta dentro de
  la ventana y aviso si cierra; se conserva al rehacer el plan. En el mapa cuenta como parada.
- UI: "Buscar dónde comer" en cada franja de comida y "Dónde comer este día" abren el buscador
  dentro del panel Itinerario (móvil y escritorio). Las tarjetas "Buscar cerca de" son a la vez el
  selector y la comparación. Cada sitio: horario según OSM, minutos a pie a cada referencia,
  terraza/dieta/precio, "Elegir para esta comida", "Cómo llegar" (Google Maps a pie), web y
  reserva solo si existe. La ficha de la capa de gastronomía muestra cocina, dieta, terraza,
  precio y reservas, y "Comer aquí" la pone en una comida del plan.
- Demo: `pois/fixtures/food.json` (heladerías, mercado y zona de restauración de la misma zona) y
  `routing/fixtures/food.json` (matrices reales de FOSSGIS entre Hotel México/70 lugares y los 60
  sitios de comida más cercanos a cada uno), con `scripts/record-food-fixtures.mts`. La matriz demo
  devuelve `null` en las celdas no grabadas (antes fallaba entera).
- Pendiente: proveedor real de valoraciones/precios (Google Places, Foursquare: clave y
  condiciones de caché), franja de merienda en el optimizador y filtro por precio (sin datos).

### ✅ Fase 8 — Entradas, reservas y presupuesto

Estados informativos y manuales, prioridad de enlaces oficiales (Wikidata P856, OSM `website`),
capa 6; presupuesto acumulado con confirmado/orientativo/sin precio. (§12, §6.5)

Decisiones Fase 8:

- Estado informativo (`src/lib/booking/info.ts`, puro): visitas por `Place.tickets` (etiquetas OSM
  `fee`, `charge`, `reservation` y `website:tickets`/`reservation:website`/`website:booking`, tal
  cual); comidas por `Place.food.reservation`. `reservation=required` o de pago (`fee=yes`, `fee`
  con importe o `charge`) → entrada necesaria; `recommended` → reserva recomendada; `fee=no` o
  donativo → gratuita; `reservation=no` → sin reserva; cualquier otra cosa o nada → pendiente de
  verificar. El texto libre de la fuente se muestra entre comillas ("según OpenStreetMap"). Wikidata
  solo aporta la web oficial: P2555 (tarifa) casi nunca está y no se consulta. Alojamiento y
  transporte no tienen estado de entradas.
- Enlaces (`bookingLinksOf`): web oficial (Wikidata P856 con su fecha de consulta, si no OSM
  `website`; siempre marcada "web general") > venta del propio sitio (enlace de venta de OSM en el
  mismo dominio que la web oficial) > proveedor autorizado (del proveedor de entradas) > alternativa
  (enlace de venta de OSM de otro dominio, "comprueba que es de confianza", y el artículo de la
  etiqueta `wikipedia`, "información, no venta"). Sin enlaces, la ficha de OSM. Se derivan al
  generar o editar el día (`toItineraryDay`) y se guardan en `Activity.bookingRequirement/Links`.
- Proveedor de entradas (`src/server/providers/tickets/`): `TicketsProvider.offers()` con
  productos casados por lugar (`authorized_reseller`, precio "desde" con fecha, disponibilidad solo
  en tiempo real, `isProposal`). Solo existe el adaptador "no configurado"; el hueco de Ticketdoor
  (Fase 11) está documentado en `index.ts`. Nada de Ticketdoor en datos ni enlaces.
- Estado manual: `Activity`/`Hotel` + `bookingNote` y `paidPrice` (migración `20261028000000_bookings`);
  `PUT /api/trips/[id]/bookings` (`target: activity|hotel`, sustituye estado, nota y pagado) y
  `GET` (estado del proveedor y productos). Solo se cambia al guardar; abrir un enlace no llama a
  nada. Al regenerar, la anotación sigue al lugar (las visitas nuevas cambian de id) y lo reservado
  o comprado se conserva en su día; cambiar el restaurante de una comida borra su anotación.
- Presupuesto (`src/lib/booking/budget.ts`, puro, se calcula en el cliente con el itinerario en
  caché): confirmado = lo que el usuario anota como pagado (en la moneda del viaje; en otra, sin
  precio); orientativo = precio "desde" del proveedor o `charge` de OSM × viajeros, o 0 si es
  gratuita según OSM, siempre con fuente y fecha; sin precio = el resto (comidas, visitas sin
  dato, hotel sin pagar, trayectos en taxi o transporte público). Las canceladas no suman.
  Desviación por partida y total: ok, cerca (≥ 90 %), en riesgo (con lo orientativo se pasa) y
  superado (lo confirmado ya pasa). Sin total, se usa la suma de partidas. Con elementos sin precio,
  "te quedan" se muestra en tono neutro.
- UI: vista "Reservas" (sexta pestaña en móvil y en el panel): total, tus reservas por grupo (por
  reservar, reservadas o compradas, pendientes de verificar, gratis o sin reserva, canceladas) con
  el hotel, y partidas con barra (confirmado relleno, orientativo rayado, marca del presupuesto si
  se supera) y detalle por línea. Ficha: sección "Entradas y reservas". Itinerario: etiquetas de
  estado, primer enlace y "Anotar reserva". Capa 6 "Entradas" (token `--layer-tickets`, icono de
  entrada): actividades del plan con insignia (✓ anotada, ! por reservar, × cancelada); la lista
  muestra el estado en texto.

### ✅ Fase 8b — Buzón de ideas y mejoras
Igual que en Proyecto W (`C:\Proyecto X`, `apps/web/src/lib/feedback.ts`, `FeedbackSheet`,
`apps/api/src/feedback`): botón "Buzón" accesible desde cualquier pantalla (también en móvil),
tipo error/idea/mejora, texto (2000), hasta 3 capturas comprimidas en el navegador y contexto
automático (ruta, viaje, viewport, navegador; nada personal). Tabla `Feedback`, `POST /api/feedback`
público con límites, `GET`/`PATCH` protegidos con `FEEDBACK_ADMIN_KEY`. Comando
`pnpm feedback [--prod] [--done <id>]` que imprime los pendientes y guarda imágenes en
`data/privado/buzon/` (ignorado por Git). «Mira si hay comentarios nuevos» = `pnpm feedback --prod`.

Decisiones Fase 8b:

- Botón «Buzón» en `SiteHeader` (cabecera común de portada, asistente y `/trips/[id]`, encima del
  mapa: no tapa la barra inferior ni el bottom sheet). `FeedbackDialog` se monta una vez en el
  layout y se abre con `openFeedback()` (evento `tripmind:feedback`); al cerrar devuelve el foco a
  quien lo abrió. Radix Dialog: hoja inferior a todo el ancho en móvil (`92dvh`, safe area) y
  diálogo centrado desde `sm`. Sin `sonner`: el éxito se muestra dentro del diálogo («Enviar otro»).
  Si se cierra a medias se conserva el borrador.
- Límites (`src/domain/feedback.ts`, compartidos por cliente y servidor) iguales que Proyecto W:
  texto 3–2000, 3 imágenes, 300 000 caracteres base64 por imagen y 800 000 entre todas; la
  compresión (`src/lib/feedback.ts`) reduce a 1600/1200/900 px y prueba WebP→JPEG con calidad
  0,82→0,45. El tipo por defecto es «Error».
- Contexto automático sin datos personales: `path`, `tripId` (solo si la ruta es `/trips/<id>`),
  `viewport`, `dpr`, `mode` (clase `dark`) y `browser` (user agent recortado). Nada de IP: la IP
  solo se usa en memoria para el límite de frecuencia.
- `Feedback.tripId` no es relación: el comentario sobrevive al borrado del viaje. Estados
  `new/read/done`; migración `20261029000000_feedback` generada con `prisma migrate diff`
  (`migrate dev` falla con el shadow DB de `prisma dev`).
- API: `POST` público (≤ 1 MB por `content-length` y por bytes leídos; 10 envíos/10 min por IP en
  memoria, por instancia); `GET`/`PATCH` con `x-feedback-key` comparada en tiempo constante;
  sin `FEEDBACK_ADMIN_KEY` (o con menos de 16 caracteres) siempre 401.
- `pnpm feedback` (`scripts/feedback.mts` con `tsx`, ahora devDependency) lee la BD con su propio
  `PrismaClient` (no importa `server-only`); el formato Markdown y los argumentos son puros en
  `src/server/services/feedback/format.ts`. `--done` exige ≥ 4 caracteres y un único comentario
  que coincida.

### ⬜ Fase 9 — Descubrimiento y diferenciales

"Descubre algo diferente" + eventos Ticketmaster; mapa de calor de oportunidades; modo
"tengo 3 horas libres"; modo lluvia con Open-Meteo. (§13, §14) + resto del prompt pendiente.
Calendario del destino: festivos (Nager.Date), eventos especiales con fuente y cambio de hora
(zona IANA) con avisos por día y su efecto en horarios del optimizador. (§17)
"Guardar desde TikTok/Instagram" (oEmbed + confirmación del lugar) y "Popular ahora" con
Wikimedia Pageviews. (§18)

### ⬜ Fase 9b — Llegada y salida: aeropuerto ⇄ hotel

Aeropuerto de llegada/salida, recorridos al hotel por modo en el mapa con tiempos reales y
margen para el vuelo. (§22)

### ⬜ Fase 10 — Exportación, mapa del tesoro y recuerdos

PDF con Playwright desde `/trips/[id]/print`, `.html` interactivo autónomo, `.ics`, `.gpx`/`.kml`
y enlace de solo lectura (§15), con estética de **mapa del tesoro** y **modo viaje con
recuerdos** (foto al llegar a cada parada y mapa de recuerdos final). (§21)

### ⬜ Ideas futuras (después de la Fase 12)

- **"Inspírame"**: destinos en auge según presupuesto, fechas e intereses (§19); el filtro por
  presupuesto depende de conseguir un proveedor de precios de vuelos/hoteles.
- **Cruceros**: planificar escalas a partir del crucero que introduce el usuario (§20); proveedor de
  itinerarios/precios solo si se consigue acceso.

### ⬜ Fase 11 — Demo Ticketdoor

Adaptador `tickets/ticketdoor` (interfaz + demo señalizado como propuesta), flujo "planifica tu día
alrededor de tu entrada" (`/plan?attraction&date&time`, entrada bloqueada en el itinerario) y
viaje demo pulido para la reunión. (§16, `docs/TICKETDOOR.md`)

### ⬜ Fase 12 — QA y entrega

E2E completos (escritorio/móvil), accesibilidad, rendimiento, estados vacíos/error, README final
con activación de cada proveedor y sus limitaciones/licencias.
