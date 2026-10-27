# TripMind

Planificador de viajes con mapa interactivo central. Plan por fases en `docs/ROADMAP.md`
(cada fase en un chat nuevo); requisitos resumidos en `docs/REQUISITOS.md` — lee solo las secciones
que pida la fase.

## Reglas de trabajo
- Un commit por funcionalidad (mensajes en español, estilo `feat: ...`, `fix: ...`) y `git push origin main`.
- Al terminar una fase: marcarla ✅ en `docs/ROADMAP.md` y anotar decisiones relevantes.
- Ejecutar `pnpm lint`, `pnpm typecheck` y `pnpm test` antes de cada commit.
- «Mira si hay comentarios nuevos» = `pnpm feedback --prod`: leer `data/privado/buzon/pendientes.md`
  y sus imágenes; al resolver uno, `pnpm feedback --prod --done <id>`.

## Reglas de producto (no negociables)
- Nunca inventar lugares, coordenadas, precios, horarios, disponibilidad, valoraciones, eventos,
  líneas de transporte ni URLs. Todo dato externo lleva `source` y `isDemo`.
- Claves API solo en servidor (`process.env`, sin prefijo `NEXT_PUBLIC_`).
- Sin reservas ni pagos automáticos; un enlace abierto no es una reserva.
- Si un proveedor falla o no está configurado: indicarlo en la UI y ofrecer enlace externo.

## Diseño
- Toda pantalla sigue `docs/DISENO.md`: **mobile-first** (375 px → tablet → escritorio) y WCAG 2.2 AA.
- Usa las skills de diseño instaladas (`frontend-design`, `Design`, `Axe Accessibility`) en cada fase con UI.

## Stack
Next.js 15 App Router · React 19 · TypeScript estricto · Tailwind v4 · shadcn/ui · MapLibre
(react-map-gl) · Prisma + PostgreSQL · Zod · Zustand · TanStack Query · Vitest · Playwright · pnpm.

## Estructura
- `src/app` rutas y route handlers (`src/app/api/*`)
- `src/components` UI (`ui/` = shadcn)
- `src/domain` tipos y esquemas Zod
- `src/server/providers/<área>/` adaptadores (`real` + `demo`) detrás de una interfaz común
- `src/server/services` lógica (optimizador, puntuaciones)
- `tests/e2e` Playwright · tests unitarios junto al código (`*.test.ts`)
