# Proveedores de datos

Cada proveedor tiene adaptador real y adaptador demo (fixtures marcados `isDemo: true`). Revisar
las condiciones antes de producción. Implementados: geocodificación y lugares (Fase 1); rutas,
matriz de tiempos, transporte público y estaciones/paradas (Fase 4).

| Área | Proveedor | Clave | Limitaciones / condiciones |
|---|---|---|---|
| Teselas de mapa | OpenFreeMap | No | Atribución OSM obligatoria. Sin SLA. Alternativa con clave: MapTiler, Stadia |
| Autocompletado (español) | Geoapify (datos OSM) | Sí (gratis) | 3.000 créditos/día y uso comercial limitado en el plan gratuito; atribución "Powered by Geoapify". Si falla o se agotan créditos → Photon |
| Autocompletado | Photon (komoot) | No | Servidor público con uso razonable; para volumen, autoalojar |
| Geocodificación | Nominatim (OSM) | No | Máx. 1 petición/s, User-Agent con contacto, **prohibido autocompletado** |
| Lugares | Overpass API | No | Cuotas por IP; consultas acotadas por bbox y caché obligatoria |
| Fotos / web oficial | Wikidata + Wikimedia Commons | No | Mostrar autor y licencia de cada imagen |
| Rutas a pie/coche | OSRM de FOSSGIS (`routing.openstreetmap.de`) / OpenRouteService | ORS sí | FOSSGIS: máx. 1 petición/s, sin uso intensivo, atribución; ORS (plan gratuito): 2000 rutas y 500 matrices al día, 40/min |
| Transporte público | Transitous (MOTIS 2) | No | Solo proyectos de código abierto y **no comerciales**; User-Agent con contacto; enlace visible a transitous.org/sources; coordinar si se superan ~720 `/plan` al día |
| Estaciones y paradas | Overpass API (OSM) | No | Igual que lugares; las líneas (`route_ref`) son etiquetas del mapa, no horarios |
| Tiempo | Open-Meteo | No | Gratis para uso no comercial; previsión hasta 16 días |
| Eventos | Ticketmaster Discovery | Sí (gratis) | 5000 peticiones/día; cobertura desigual por país |
| Festivos | Nager.Date | No | Nacionales y regionales; las fiestas locales pueden faltar (avisar y enlazar a fuente oficial) |
| Horarios | Librería `opening_hours` (OSM) | No | LGPL-3.0; evalúa la etiqueta `opening_hours` de OSM, que puede estar desactualizada: la UI lo marca "según OSM" o "pendiente de confirmar" |
| Cambio de hora | Base de datos IANA (`Intl` / `date-fns-tz`) | No | Local, sin llamadas externas |
| Vídeos enlazados | oEmbed de TikTok / Instagram | Instagram sí (Meta) | Solo metadatos y reproductor embebido de enlaces que aporta el usuario; sin scraping ni descargas |
| Popularidad | Wikimedia Pageviews API | No | Mide visitas a Wikipedia, no redes sociales; etiquetarlo así |
| Hoteles (precios) | — | — | Requiere acuerdo con proveedor autorizado; hasta entonces solo OSM + enlaces de búsqueda |

## Arquitectura (`src/server/providers/`)

- `core/`: tipos (`ProviderInfo`, `ProviderError`), `fetchJson` con timeout y User-Agent
  (`TripMind/0.1 (+repo; CONTACT_EMAIL)`), `RateLimiter`, caché y registro.
- **Registro** (`core/registry.ts`): `PROVIDERS_MODE=demo` fuerza fixtures; `auto` usa el adaptador
  real si su configuración está completa y, si no, demo con un aviso (`provider.notice`). Un fallo
  en tiempo de ejecución **no** cae a demo: la API responde 502 con `externalUrl` para que la UI lo
  indique y ofrezca un enlace externo.
- **Caché** (`core/cache.ts`): tabla `ProviderCache` (clave, proveedor, valor JSON, `expiresAt`).
  Si no hay `DATABASE_URL` se usa memoria; si la BD falla, se llama al proveedor sin caché.
  Lo leído de caché se valida con Zod. TTL: Photon 7 días, Nominatim 30 días, Overpass 24 h
  (bbox ajustado a una rejilla de ~550 m para reutilizar consultas), Wikidata/Commons 7 días.
- Todo dato externo lleva `source` (nombre, URL, fecha de obtención, licencia, atribución) e `isDemo`.

| Área | Adaptador real | Requisito para usarlo | Demo |
|---|---|---|---|
| Autocompletado | Photon (`/api/geocode?mode=autocomplete`) | `CONTACT_EMAIL` | `geocoding/fixtures/photon.json` (Madrid, Barcelona) |
| Búsqueda | Photon → respaldo Nominatim (`mode=search`), máx. 1 req/s | `CONTACT_EMAIL` | `geocoding/fixtures/nominatim.json` |
| Lugares | Overpass por bbox (máx. 0,0016 grados², ~4×4 km) | `CONTACT_EMAIL` | `pois/fixtures/overpass.json` (Madrid centro: Prado, Letras, Atocha) |
| Estaciones y paradas (capa 4) | Overpass, capa `transport` (metro, tren, tranvía, estación y parada de autobús) | `CONTACT_EMAIL` | `pois/fixtures/stops.json` (172 paradas, Madrid centro algo más amplio) |
| Rutas a pie / coche | OpenRouteService si hay `OPENROUTESERVICE_API_KEY`; si no, OSRM de FOSSGIS | `OPENROUTESERVICE_API_KEY` o `CONTACT_EMAIL` | `routing/fixtures/routing.json` (desde Hotel México a 70 lugares y 18 estaciones; matrices 71×71 y 71×18) |
| Matriz de tiempos | Mismo proveedor (`table` de OSRM / `matrix` de ORS), máx. 100 puntos únicos | (igual) | Submatrices de las tablas grabadas |
| Transporte público | Transitous `/api/v1/plan` | `CONTACT_EMAIL` | `transit/fixtures/transitous.json` (57 planes del 28-10-2026 a las 10:00) |
| Fotos / web oficial | Wikidata (P18, P856) + Commons (autor, licencia) | (igual que lugares) | `pois/fixtures/wikidata.json`, `commons.json` |

Sin `CONTACT_EMAIL` se usa demo porque Nominatim, Overpass y Wikimedia piden un contacto en el
User-Agent. Nominatim **nunca** se usa para autocompletar (lo prohíbe su política).

### Rutas y transporte (Fase 4)

- **Rutas a pie y en coche**: el servidor demo `router.project-osrm.org` **no sirve**: solo tiene
  perfil de coche aunque la URL diga `foot`. Se usan los servidores OSRM de FOSSGIS (los de
  openstreetmap.org), uno por perfil (`routed-foot`, `routed-car`), con cola de 1 petición/s. Con
  `OPENROUTESERVICE_API_KEY` se usa ORS (`foot-walking`, `driving-car`; la clave va en la cabecera
  `Authorization` desde el servidor). Caché de 7 días (rutas y matrices).
- **Transporte público**: Transitous (MOTIS 2) con `fastestDirectFactor=1.5` (por defecto MOTIS
  descarta el transporte público si andar es más rápido; el comparador ya muestra la opción a pie).
  Se elige el itinerario que llega antes; tiempo, transbordos, líneas (nombre y colores del feed
  GTFS), paradas y horas programadas. Caché de 6 h con la salida redondeada a 5 min.
  **Cobertura comprobada en Madrid (27-10-2026)**: Cercanías Renfe y autobuses interurbanos del
  Consorcio, **sin Metro de Madrid ni EMT**. Por eso en el centro casi siempre gana andar.
- **Hora de salida**: el usuario elige día del viaje y hora local; el servidor obtiene la zona
  IANA con `@photostructure/tz-lookup` (tabla local, sin llamadas) y calcula el desfase real de ese
  día (cambio de hora incluido).
- **Sin ruta real** (fallo, sin cobertura, sin trayecto): el modo vuelve como `approximate` con
  el motivo (`provider_failed`, `no_route`, `no_coverage`), la distancia en línea recta (marcada
  como tal), la línea recta discontinua en el mapa y enlaces a Google Maps (URL pública
  `maps/dir/?api=1` con origen, destino y modo) y a las rutas de openstreetmap.org. Nunca lleva
  duración: no se estiman tiempos, líneas, horarios ni precios. El precio del taxi no se muestra.
- **Matriz** (`travelMatrix`, para el optimizador de la Fase 5): tiempos y distancias por par,
  más la distancia en línea recta; si el proveedor falla, `quality: "unavailable"` sin tiempos.
- **Preguntas**: "¿hay metro cerca?" busca estaciones y paradas a ≤ 800 m y mide a pie las más
  cercanas de cada tipo (estaciones y autobús por separado); "¿qué puedo visitar a pie?" filtra
  primero por línea recta (cota a 100 m/min) y decide solo con tiempos reales de la matriz.

### Capas del mapa y categorías OSM (`pois/categories.ts`)

| Capa | Categorías (etiquetas OSM) |
|---|---|
| `tourism` | museum, gallery, monument (`historic` monument/castle/palace y memoriales que no son placas), attraction, viewpoint, park (park/garden no privado), place_of_worship (solo con `wikidata`), theatre |
| `food` | restaurant, cafe, bar (bar/pub), fast_food |
| `lodging` | hotel, hostel, apartment, guest_house |
| `transport` | train_station, metro_station (`station=subway`), tram_stop (`railway=tram_stop`, `station=light_rail`), bus_station, bus_stop (`highway=bus_stop`); con líneas `route_ref`, `network` y `operator` |

**Recorte por relevancia** (`pois/ranking.ts`): Overpass recorta en orden geográfico (`qt`), así
que el adaptador real pide hasta 2000 elementos y, igual que el demo, ordena antes de aplicar
`limit`: capa turística, entidad de Wikidata, artículo de Wikipedia, imagen y web oficial (señales
de la fuente, no valoraciones). Así un recorte a 500 nunca deja fuera el Museo del Prado.

La web oficial de Wikidata (P856) tiene prioridad sobre `website` de OSM (`websiteSource`). Las
imágenes de Commons sin licencia en sus metadatos se descartan.

### API

- `GET /api/geocode?q=…&mode=autocomplete|search&limit=1-10[&lat=…&lng=…]`
- `GET /api/places?bbox=oeste,sur,este,norte[&layers=tourism,food][&categories=museum][&limit=1-500]`

Respuesta: `{ results, provider: { id, name, isDemo, notice? }, fromCache, warnings? }`.

- `GET /api/routes?from=lat,lng&to=lat,lng[&modes=transit,walk,car][&date=YYYY-MM-DD&time=HH:MM]`:
  siempre 200, un resultado por modo (`routed` u `approximate`), `departure` y `timeZone`.
- `POST /api/routes/matrix { origins, destinations, mode }`: matriz de tiempos (`walk`/`car`).
- `POST /api/routes/walkable { origin, maxMinutes, targets }`: destinos a ≤ N min a pie.
- `GET /api/transit/nearby?at=lat,lng`: estaciones y paradas cercanas con tiempo a pie.

- `GET /api/trips/[id]/itinerary` (`{ days, meta }`), `POST` (genera o regenera conservando lo
  bloqueado) y `PATCH` con `{ op: add | remove | move | set_time | lock | reorganize, … }`:
  recalcula los días afectados. 409 `invalid_edit`, 502 si fallan los lugares (con mapa de OSM).
- `GET|POST /api/trips/[id]/favorites` y `DELETE /api/trips/[id]/favorites?placeId=…`: lugares
  guardados del viaje (snapshot `Place` con `source` e `isDemo`); 404 si el viaje no existe,
  503 `storage_unavailable` si la BD falla.
Errores: 400 `invalid_request` (con `issues`), 502 `provider_unavailable` (con `externalUrl`).

### Fixtures demo

Son respuestas reales grabadas con `npx tsx scripts/record-fixtures.mts` y, las de la Fase 4, con
`npx tsx scripts/record-route-fixtures.mts [--routes|--transit]` (fecha en `recordedAt`, que se
usa como `source.retrievedAt`). De Transitous se recortan alertas, alternativas y pasos a pie.
La demo de transporte devuelve el plan grabado con sus horas reales (la UI dice de qué día son). En Wikidata solo se conservan las declaraciones P18 y P856.
Los adaptadores demo pasan los fixtures por los mismos mapeadores que los reales y, fuera de la zona
grabada, devuelven lista vacía con un aviso: nunca generan datos.
