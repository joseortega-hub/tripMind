# Proveedores de datos

Estado: se implementan a partir de la Fase 1. Cada proveedor tiene adaptador real y adaptador
demo (fixtures marcados `isDemo: true`). Revisar las condiciones antes de producción.

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
| Hoteles (precios) | — | — | Requiere acuerdo con proveedor autorizado; hasta entonces solo OSM + enlaces de búsqueda |
