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

### Sin Docker (equipos con poca RAM)
`prisma dev` levanta un Postgres local ligero (PGlite) sin Docker ni contraseñas:

```bash
npx prisma dev -n tripmind --detach
npx prisma dev ls
```

Copia la URL `TCP` que muestra `ls` (p. ej.
`postgres://postgres:postgres@localhost:51214/template1?sslmode=disable`) en `DATABASE_URL` del
`.env` y ejecuta `npx prisma migrate deploy`. Tras reiniciar el equipo:
`npx prisma dev start tripmind`. Con `psql` hay que usar `PGSSLMODE=disable`.

## Scripts
| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm test` | Tests unitarios (Vitest) |
| `pnpm e2e` | Tests end-to-end (Playwright, proveedores en modo demo) |
| `pnpm db:up` / `pnpm db:migrate` | Arranca Postgres en Docker / aplica migraciones |
| `pnpm feedback [--prod] [--done <id>] [--keep-new] [--all]` | Lee el buzón de ideas y errores (BD local o de producción con `PROD_DATABASE_URL`) y guarda `data/privado/buzon/` |

## Proveedores de datos
Todos los proveedores funcionan en modo demo sin claves. La tabla de proveedores, cómo activarlos
y sus limitaciones se documentan en `docs/PROVEEDORES.md` (Fase 1 en adelante).

El mapa usa teselas de [OpenFreeMap](https://openfreemap.org) con datos © OpenStreetMap
contributors; la atribución es obligatoria y se muestra en el mapa.
