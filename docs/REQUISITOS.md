# TripMind — Requisitos (resumen del prompt original)

Plataforma web que convierte una idea de viaje en un plan completo: itinerario por días, mapa
interactivo central, hoteles, restaurantes, transporte público, entradas, presupuesto y alternativas.
Debe servir para una escapada de fin de semana y para viajes de varias semanas.

> Cada fase lee solo las secciones que necesita. El número de sección coincide con el prompt original.

## 3. Principios (obligatorios en todo el código)
1. Utilidad real > adornos. Producto funcional, no demo estática.
2. Separar datos reales de simulados (campo `source` + flag `isDemo` en todo dato externo).
3. **Nunca inventar** establecimientos, coordenadas, precios, horarios, disponibilidad, valoraciones,
   eventos, líneas de transporte, URLs ni enlaces de afiliación.
4. Fuentes verificables; varios proveedores detrás de adaptadores intercambiables.
5. Claves API solo en servidor (`.env`), nunca en frontend ni en el repo.
6. No automatizar reservas ni pagos. Un enlace externo abierto ≠ reserva confirmada.
7. No presuponer que todas las ciudades tienen los mismos datos (p. ej. transporte).
8. Si falta una fuente: degradar con elegancia, indicarlo y ofrecer enlace externo.
9. Documentar limitaciones/licencias de cada proveedor. Evitar llamadas innecesarias (caché).
10. Arquitectura preparada para crecer, sin complejidad empresarial innecesaria.

## 5. UX
- Moderna, elegante, aspecto de producto turístico profesional; sin gradientes excesivos ni
  "tarjetas genéricas de IA". Tipografía legible, jerarquía clara.
- Mapa central. Escritorio: 3 zonas (itinerario | mapa | panel de detalle). Móvil: mapa + bottom sheet.
- Cambio entre vista mapa / lista / itinerario. Filtros, indicadores de precio, tiempos, enlaces de
  reserva, presupuesto acumulado, favoritos, fotos cuando haya fuente adecuada.
- Estados de carga, error, vacío y "falta configuración".

## 6. Asistente de creación de viaje (6 pasos)
1. **Destino y fechas**: autocompletado geográfico, llegada, salida, viajeros (adultos/menores).
2. **Alojamiento**: ¿ya tienes hotel? Sí → buscarlo, mostrarlo en mapa, usarlo como origen.
   No → presupuesto/noche, categoría, habitaciones, tipo (hotel/apartamento/hostal/otro),
   preferencia de zona (céntrica/bien comunicada), accesibilidad.
3. **Preferencias** (multiselección con peso): monumentos e historia, museos, naturaleza, playas,
   gastronomía, compras, vida nocturna, conciertos/eventos, deporte, parques temáticos,
   experiencias originales, lugares poco conocidos, fotografía, arquitectura, familiar, gratis.
4. **Ritmo**: relajado/equilibrado/intensivo; hora inicio/fin, tiempo para comer, tiempo libre,
   movilidad reducida, días sin actividades.
5. **Presupuesto**: total + alojamiento, comida, actividades, transporte. Distinguir
   confirmado / orientativo / sin precio.
6. **Generación**: itinerario por días, mapa, restaurantes, transporte, entradas, presupuesto,
   alternativas. Todo editable; el usuario mantiene el control.

## 7. Hoteles
- Campos (si hay datos): nombre, ubicación, distancia a POIs, precio/noche y total, valoración +
  nº reseñas + fuente, servicios, cancelación, distancia a transporte, tiempo a puntos clave, enlace.
- Ordenar por precio, ubicación, valoración, precio/ubicación, acceso a transporte.
- Puntuación configurable: presupuesto + proximidad itinerario + transporte + valoración + preferencias.
- El hotel elegido es el centro del viaje: cambiarlo recalcula distancias, tiempos y recomendaciones.
- Enlaces oficiales o de proveedores autorizados; si no hay integración, enlace de búsqueda de
  disponibilidad. Sin disponibilidad simulada.

## 8. Mapa temático (módulo clave)
Capas activables: 1 turismo, 2 gastronomía, 3 alojamiento, 4 transporte (estaciones/paradas/rutas
fiables), 5 itinerario diario (ruta ordenada con hotel), 6 entradas/actividades con reserva,
7 guardados. Interacción: zoom, pan, selección, filtros, clustering, resaltado, rutas, cambio de día,
seleccionar desde itinerario → centrar en mapa. Marcadores distinguibles por categoría.
Sin rutas ficticias: si no hay ruta real, línea marcada como "aproximada" + enlace a servicio externo.

## 9. Itinerario diario
- Franjas: desayuno, actividad 1, actividad 2, comida, tarde, cena, noche opcional (solo estructura).
- Por actividad: nombre, ubicación, hora, duración, coste, distancia y tiempo desde el anterior,
  medio, necesidad de reserva, enlace info/entradas, alternativa si está cerrado.
- Optimizador: agrupar cercanos; considerar distancias, tiempos, horarios, duración, entradas,
  preferencias, comidas, presupuesto, ritmo, hotel. Nunca programar en horario confirmado cerrado;
  horario no verificado → "pendiente de confirmar". Nada de itinerarios imposibles.
- Edición manual: añadir, eliminar, reordenar, cambiar día/hora, **bloquear** actividad,
  "reorganizar el resto del día". Recalcular desplazamientos afectados.

## 10. Restaurantes
- Contextuales: según dónde estará el usuario a la hora de comer (cerca de la actividad previa/siguiente
  u hotel). Filtros: precio, cocina, valoración, distancia, tiempo, dieta, vegetariano/vegano,
  tradicional, rápida, experiencia, terraza, momento del día.
- Precio: Económico / Medio / Especial / Alta gama (rango con fuente si existe).
- Ficha: nombre, ubicación, cocina, precio, valoración+fuente, horario, distancia, tiempo, web
  oficial, enlace de reserva, indicaciones. Sin menús, precios ni mesas inventados.

## 11. Transporte público
- Proveedores intercambiables: GTFS/GTFS-RT, APIs oficiales, planificadores, rutas peatonales.
- Por trayecto: origen, destino, modo, tiempo, transbordos, paradas, coste (si fuente fiable),
  frecuencia, enlace, fecha de actualización.
- Comparar transporte público / a pie / taxi / coche.
- Desde el hotel: "¿cuánto tardo al museo?", "¿hay metro cerca?", "¿vuelvo al hotel antes de cenar?",
  "¿qué puedo hacer sin transporte público?".
- Sin datos fiables → decirlo + enlaces oficiales. Un enlace genérico a un mapa no es una ruta calculada.

## 12. Entradas y reservas
- Estados informativos: entrada necesaria / reserva recomendada / gratuita / sin reserva / pendiente de verificar.
- Prioridad de enlace: web oficial > taquilla oficial > proveedor autorizado > alternativa fiable.
  Indicar si el enlace es solo la web general. Nunca URLs inventadas.
- Estado manual del usuario: pendiente / reservada / entrada comprada / cancelada.

## 13. "Descubre algo diferente"
Lugares poco conocidos, cultura, mercados, miradores tranquilos, rutas urbanas, eventos temporales,
conciertos, exposiciones, noche, gastronomía, aire libre. Priorizar eventos en las fechas del viaje
con fuente actualizada. Si no hay datos, mostrar categorías y permitir investigar.

## 14. Diferenciales
- **A.** Hotel como centro del viaje (recalcular todo al cambiarlo).
- **B.** Mapa de calor de oportunidades según preferencias (indicar que es puntuación interna).
- **C.** "Tengo tres horas libres": tiempo + ubicación → actividades cercanas realistas.
- **D.** Modo lluvia: sustituir actividades al aire libre por interiores; usar previsión solo con fuente real.
- *(El prompt original se cortó aquí. Añadir el resto cuando el usuario lo envíe.)*

## 15. Exportación del viaje (añadido por el usuario)
- **PDF**: documento cuidado listo para imprimir o enviar: portada, resumen, mapa por día,
  itinerario por franjas con tiempos y transporte, hoteles, restaurantes, entradas (con su estado y
  enlaces), presupuesto, alternativas y fuentes/atribuciones. Se genera con Playwright renderizando
  una vista `/trips/[id]/print` (mismo diseño que la web, mapas incluidos).
- **Archivo interactivo**: un `.html` autónomo (un solo archivo, funciona sin servidor) con mapa
  navegable, días, fichas y enlaces; las teselas necesitan conexión y, sin ella, se muestran las
  listas. Además: `.ics` (calendario) y `.gpx`/`.kml` (apps de mapas).
- Enlace compartible de solo lectura `/share/[token]`.
- Nunca incluir datos de pago ni códigos de entradas.

## 17. Calendario del destino: festivos, eventos especiales y cambio de hora (añadido por el usuario)
- **Festivos**: nacionales y regionales/locales del destino en las fechas del viaje
  (p. ej. Nager.Date, sin clave; para fiestas locales que no cubra, fuentes oficiales). Mostrar
  aviso en el día afectado: "Festivo: muchos comercios y museos pueden cerrar o cambiar horario".
  El optimizador usa el festivo al evaluar `opening_hours` (regla `PH` de OSM) y, si el horario
  festivo no está verificado, marca la visita como "pendiente de confirmar".
- **Eventos especiales** (fiestas populares, ferias, maratones, grandes conciertos, Semana Santa…):
  con fuente fechada (Ticketmaster, webs oficiales de turismo o Wikidata). Mostrar si suponen
  oportunidad (verlo) o impacto (cierres, cortes de tráfico, hoteles más caros). Nunca inventarlos.
- **Cambio de hora**: si el horario de verano/invierno cambia durante el viaje (zona horaria IANA
  del destino, `Intl`/`date-fns-tz`), avisar en el día exacto ("esta noche a las 3:00 los relojes
  se atrasan a las 2:00") y ajustar las horas del itinerario. Mostrar también la diferencia
  horaria con la zona del usuario si es distinta.
- Todo se ve en una franja de "Calendario del viaje" del itinerario, en el PDF/archivo
  interactivo y en el `.ics`.
- **Cada tipo de aviso tiene color y letra propios** (insignia con letra + color + nombre accesible,
  nunca solo color), con leyenda visible. Tipos iniciales: **F** festivo, **E** evento especial,
  **H** cambio de hora, **C** cierre o cambio de horario de un lugar, **T** incidencia de transporte
  (huelga, corte), **M** meteorología (lluvia, calor extremo), **R** reserva o entrada del usuario.
- **Filtros**: por tipo (chips con la misma letra y color, multiselección), por impacto
  (oportunidad / afecta al plan), por día y por fuente; "solo lo que afecta a mi itinerario".
  El filtro se recuerda por viaje y se aplica igual en la vista de calendario, la lista y el mapa.

## 18. Lugares "trending" y redes sociales (añadido por el usuario)
Viabilidad (oct. 2026, revisar términos antes de implementar):
- **No viable**: leer tendencias de TikTok de forma automática. La Research API es solo para
  académicos y ONG (excluye uso comercial) y el scraping incumple sus términos.
- **Viable — "Guardar desde TikTok/Instagram"**: el usuario pega o comparte el enlace de un vídeo;
  con el oEmbed público de la plataforma obtenemos título, autor y miniatura; detectamos el nombre
  del lugar en el texto, lo buscamos en OSM/Wikidata y el usuario **confirma** cuál es antes de
  añadirlo a "Guardados" (capa 7) con el vídeo embebido en la ficha. Nunca se asigna un lugar sin
  confirmación ni se descarga el vídeo.
- **Viable — señal de popularidad con fuentes abiertas**: visitas a artículos de Wikipedia
  (Wikimedia Pageviews API, sin clave) para detectar lugares en auge frente a su media; etiquetarlo
  como "Popular ahora (según visitas en Wikipedia)", nunca como "trending en TikTok".
- **Futuro**: vídeos de TikTok embebidos en fichas si un creador/socio los aporta, o acuerdos con
  creadores; Ticketdoor podría aportar sus atracciones más vendidas (ver `docs/TICKETDOOR.md`).

## 16. Integración con Ticketdoor (propuesta)
Ver `docs/TICKETDOOR.md`. Ticketdoor como proveedor de entradas autorizado y "planifica tu día
alrededor de tu entrada". Sin acuerdo firmado: solo adaptador demo y señalizado como propuesta.
