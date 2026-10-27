# Proveedores de datos

Cada proveedor tiene adaptador real y adaptador demo (fixtures marcados `isDemo: true`). Revisar
las condiciones antes de producción. Implementados (Fase 1): geocodificación y lugares.

| Área | Proveedor | Clave | Limitaciones / condiciones |
|---|---|---|---|
| Teselas de mapa | OpenFreeMap | No | Atribución OSM obligatoria. Sin SLA. Alternativa con clave: MapTiler, Stadia |
| Autocompletado | Photon (komoot) | No | Servidor público con uso razonable; para volumen, autoalojar |
| Geocodificación | Nominatim (OSM) | No | Máx. 1 petición/s, User-Agent con contacto, **prohibido autocompletado** |
| Lugares | Overpass API | No | Cuotas por IP; consultas acotadas por bbox y caché obligatoria |
| Fotos / web oficial | Wikidata + Wikimedia Commons | No | Mostrar autor y licencia de cada imagen |
| Rutas a pie/coche | OSRM demo / OpenRouteService | ORS sí | El servidor demo de OSRM no es para producción; ORS gratis con cuota diaria |
| Transporte público | Transitous (MOTIS) | No | Cobertura según feeds GTFS disponibles; uso no comercial razonable |
| Tiempo | Open-Meteo | No | Gratis para uso no comercial; previsión hasta 16 días |
| Eventos | Ticketmaster Discovery | Sí (gratis) | 5000 peticiones/día; cobertura desigual por país |
| Festivos | Nager.Date | No | Nacionales y regionales; las fiestas locales pueden faltar (avisar y enlazar a fuente oficial) |
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
| Fotos / web oficial | Wikidata (P18, P856) + Commons (autor, licencia) | (igual que lugares) | `pois/fixtures/wikidata.json`, `commons.json` |

Sin `CONTACT_EMAIL` se usa demo porque Nominatim, Overpass y Wikimedia piden un contacto en el
User-Agent. Nominatim **nunca** se usa para autocompletar (lo prohíbe su política).

### Capas del mapa y categorías OSM (`pois/categories.ts`)

| Capa | Categorías (etiquetas OSM) |
|---|---|
| `tourism` | museum, gallery, monument (`historic` monument/castle/palace y memoriales que no son placas), attraction, viewpoint, park (park/garden no privado), place_of_worship (solo con `wikidata`), theatre |
| `food` | restaurant, cafe, bar (bar/pub), fast_food |
| `lodging` | hotel, hostel, apartment, guest_house |
| `transport` | train_station, metro_station (`station=subway`), bus_station |

La web oficial de Wikidata (P856) tiene prioridad sobre `website` de OSM (`websiteSource`). Las
imágenes de Commons sin licencia en sus metadatos se descartan.

### API

- `GET /api/geocode?q=…&mode=autocomplete|search&limit=1-10[&lat=…&lng=…]`
- `GET /api/places?bbox=oeste,sur,este,norte[&layers=tourism,food][&categories=museum][&limit=1-500]`

Respuesta: `{ results, provider: { id, name, isDemo, notice? }, fromCache, warnings? }`.

- `GET|POST /api/trips/[id]/favorites` y `DELETE /api/trips/[id]/favorites?placeId=…`: lugares
  guardados del viaje (snapshot `Place` con `source` e `isDemo`); 404 si el viaje no existe,
  503 `storage_unavailable` si la BD falla.
Errores: 400 `invalid_request` (con `issues`), 502 `provider_unavailable` (con `externalUrl`).

### Fixtures demo

Son respuestas reales grabadas con `npx tsx scripts/record-fixtures.mts` (fecha en `recordedAt`,
que se usa como `source.retrievedAt`). En Wikidata solo se conservan las declaraciones P18 y P856.
Los adaptadores demo pasan los fixtures por los mismos mapeadores que los reales y, fuera de la zona
grabada, devuelven lista vacía con un aviso: nunca generan datos.
