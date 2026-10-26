# TripMind — Guía de diseño

Toda fase con interfaz la sigue. **Mobile-first**: se diseña y se prueba primero a 375 px y luego se
amplía a tablet (768 px) y escritorio (≥1280 px). Ninguna pantalla se da por terminada sin
revisarla en móvil.

## Skills de diseño
Si están instaladas en la sesión, úsalas:
- `frontend-design` (Anthropic): al crear o rediseñar pantallas y componentes.
- `Design` (Anthropic): `design-critique` al cerrar cada pantalla, `ux-copy` para textos,
  `accessibility-review` y `design-system` para mantener los tokens.
- `Axe Accessibility` (Deque): auditar y corregir WCAG 2.2 AA en cada fase con UI.
Si no están instaladas, aplica igualmente esta guía y añade `@axe-core/playwright` a los E2E.

## Identidad visual
- Producto turístico profesional y sereno: fondo claro cálido, un color de marca (azul petróleo)
  y un acento (coral) solo para acciones principales y selección. Sin gradientes llamativos ni
  tarjetas genéricas de plantilla.
- Tipografía: una sans legible para la interfaz y, como mucho, una display para titulares.
  Cifras tabulares en horas, distancias y precios.
- Colores por categoría de mapa (turismo, comida, alojamiento, transporte, entradas, guardados)
  definidos como tokens y distinguibles también por icono (no solo por color).
- Modo oscuro con los mismos tokens.
- Fotos reales con autor y licencia visibles. Sin fotos de stock que parezcan del lugar.

## Móvil
- Mapa a pantalla completa con **bottom sheet** arrastrable de tres alturas (pico, media, completa);
  el contenido principal (día, lista, ficha) vive en el sheet.
- Navegación inferior: Mapa · Lista · Itinerario · Viaje. Acción principal al alcance del pulgar.
- Objetivos táctiles ≥ 44×44 px; nada depende de hover; gestos con alternativa por botón.
- Respetar `safe-area-inset-*`, el teclado virtual (formularios sin saltos) y `100dvh`.
- El asistente: un paso por pantalla, botón "Siguiente" fijo abajo, progreso visible.
- Rendimiento: LCP < 2,5 s en 4G, mapa cargado de forma diferida, imágenes con `next/image`.

## Tablet y escritorio
- Tablet: mapa + panel lateral plegable.
- Escritorio: tres zonas (itinerario | mapa | detalle) con paneles redimensionables.

## Estados obligatorios
Carga (skeletons con la forma real), vacío (con siguiente acción), error (con reintentar y enlace
externo), "datos de demostración" y "falta configuración". Las etiquetas de fiabilidad
(confirmado / orientativo / sin precio / pendiente de verificar) son siempre visibles.

## Accesibilidad (WCAG 2.2 AA)
Contraste ≥ 4,5:1, foco visible, todo operable con teclado, `prefers-reduced-motion`, textos
alternativos, lista accesible equivalente a lo que muestra el mapa.

## Verificación por fase
- E2E Playwright en `desktop` y `mobile` (Pixel 7) y capturas en ambos tamaños.
- Auditoría axe sin errores graves.
- Revisión visual a 375 px, 768 px y 1280 px antes del commit.
