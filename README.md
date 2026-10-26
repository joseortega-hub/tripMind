# TripMind

Planificador de viajes con mapa interactivo central: itinerario por días, hoteles, restaurantes,
transporte público, entradas y presupuesto, usando fuentes de datos verificables y sin inventar
información.

- Plan de desarrollo: [docs/ROADMAP.md](docs/ROADMAP.md)
- Requisitos: [docs/REQUISITOS.md](docs/REQUISITOS.md)

## Requisitos
- Node.js 22+ y pnpm 10+
- Docker (para PostgreSQL)

## Puesta en marcha

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm dev
```

Abre http://localhost:3000.

## Scripts
| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm test` | Tests unitarios (Vitest) |
| `pnpm e2e` | Tests end-to-end (Playwright, proveedores en modo demo) |
| `pnpm db:up` / `pnpm db:migrate` | Arranca Postgres en Docker / aplica migraciones |

## Proveedores de datos
Todos los proveedores funcionan en modo demo sin claves. La tabla de proveedores, cómo activarlos
y sus limitaciones se documentan en `docs/PROVEEDORES.md` (Fase 1 en adelante).

El mapa usa teselas de [OpenFreeMap](https://openfreemap.org) con datos © OpenStreetMap
contributors; la atribución es obligatoria y se muestra en el mapa.
