# TripMind × Ticketdoor — propuesta de colaboración

> Documento de trabajo. Lo que se sabe de Ticketdoor sale de fuentes públicas (oct. 2026) y está
> **pendiente de confirmar con la empresa**. TripMind no tiene hoy ningún acuerdo, API ni enlace de
> afiliación de Ticketdoor, y no se inventará ninguno: todo lo de abajo es una propuesta.

## Quién es Ticketdoor (fuentes públicas)
- TICKETDOOR SL, Barcelona (antes LEGALTECH WORLD SL, cambio de nombre en 2023).
- Vende entradas para atracciones turísticas y monumentos de Europa ("evitar colas"), con presencia
  declarada en España, Italia, Francia, Grecia y Países Bajos.

## Por qué encajamos
Ticketdoor resuelve **la entrada**; TripMind resuelve **todo lo que rodea a la entrada**: cuándo
ir, cómo llegar desde el hotel, dónde comer cerca, qué ver después y qué hacer si llueve. Un
cliente que compra una entrada al Coliseo o a la Sagrada Família todavía tiene que organizar el
resto del día; TripMind lo hace alrededor de su reserva.

| Para Ticketdoor | Para el viajero |
|---|---|
| Más venta cruzada: tras una entrada, TripMind sugiere otras atracciones del catálogo en la misma zona y día | Un plan completo y realista en torno a su entrada |
| Menos incidencias: el itinerario cuadra la hora de la entrada con desplazamientos reales | Sabe cuánto tarda desde el hotel y a qué hora salir |
| Diferenciación frente a GetYourGuide/Tiqets: "compra la entrada y te planificamos el día" | Un PDF o un archivo interactivo con todo el viaje |
| Datos agregados (anónimos) de qué combinan los viajeros | Alternativas si hay lluvia o colas |

## Formas de integración (de menos a más esfuerzo)
1. **Enlace profundo de compra** en las fichas de actividad cuyo producto exista en Ticketdoor,
   con la prioridad de REQUISITOS §12 (web oficial primero; Ticketdoor como proveedor autorizado).
   Requiere: catálogo de productos con URL y, si quieren, parámetro de afiliado.
2. **Adaptador de catálogo** (`src/server/providers/tickets/ticketdoor`): precios "desde",
   condiciones y disponibilidad **solo si su API la da en tiempo real**; si no, se muestra como
   orientativo con fecha. Mismo patrón real/demo que el resto de proveedores.
3. **"Planifica tu día" post-compra**: Ticketdoor enlaza desde su email de confirmación a
   TripMind con la atracción, fecha y hora prellenadas (`/plan?attraction=…&date=…&time=…`);
   la entrada aparece bloqueada en el itinerario (no la mueve el optimizador) y marcada como
   "Entrada comprada" por el usuario.
4. **Widget/marca blanca**: TripMind embebido en la web de Ticketdoor con su marca.
5. **Exportación co-firmada**: el PDF/archivo interactivo del viaje incluye las entradas
   compradas en Ticketdoor (enlace a su gestión de reservas, nunca el ticket ni datos de pago).

## Qué necesitaríamos de Ticketdoor
- Acceso a catálogo (API o feed): id de producto, atracción, ciudad, coordenadas o Wikidata/OSM id,
  precio desde, idioma, duración, URL de compra, condiciones de cancelación.
- Si existe: disponibilidad/horarios en tiempo real y programa de afiliación.
- Condiciones de uso de marca y datos.

## Límites que mantenemos
- No compramos ni pagamos en nombre del usuario; abrir un enlace no es una reserva.
- No mostramos disponibilidad que la API no dé; no inventamos precios ni enlaces de afiliado.
- No pedimos ni guardamos datos de pago o el código de la entrada.

## Demo para la reunión
Viaje de 3 días a Roma o Barcelona en modo demo: el usuario indica que tiene una entrada a las
10:00 y TripMind construye el día alrededor (ruta desde el hotel, comida cerca, siguientes
visitas), con el botón de compra de Ticketdoor señalado como "integración propuesta", y la
exportación a PDF y archivo interactivo. Prevista en la Fase 11 del roadmap.
