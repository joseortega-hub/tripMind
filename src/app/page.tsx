import Link from "next/link";
import { BadgeCheck, CalendarDays, Link2, Map, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: Map,
    title: "Cuéntanos el viaje",
    text: "Destino, fechas, alojamiento, intereses, ritmo y presupuesto en seis pasos cortos.",
  },
  {
    icon: CalendarDays,
    title: "Recibe un plan por días",
    text: "Visitas agrupadas por zonas y ordenadas desde tu hotel, con tiempos de trayecto reales.",
  },
  {
    icon: Sparkles,
    title: "Ajústalo a tu manera",
    text: "Mueve, bloquea o cambia actividades. El plan se recalcula y tú decides siempre.",
  },
];

const PRINCIPLES = [
  {
    icon: BadgeCheck,
    title: "Nada inventado",
    text: "Lugares, horarios y precios salen de fuentes abiertas como OpenStreetMap y Wikidata, y cada dato enlaza a su origen. Si no hay dato, lo verás como «sin precio» o «sin verificar».",
  },
  {
    icon: Link2,
    title: "Tú reservas",
    text: "Te llevamos a la web oficial o a un proveedor autorizado. No reservamos ni cobramos nada en tu nombre: abrir un enlace no es una reserva.",
  },
  {
    icon: ShieldCheck,
    title: "Transparente cuando falta algo",
    text: "Si una fuente no responde o no cubre tu destino, te lo decimos y te ofrecemos una alternativa externa.",
  },
];

/** Ilustración abstracta de un recorrido sobre un plano (sin lugares reales). */
function RouteIllustration() {
  return (
    <svg
      viewBox="0 0 400 320"
      className="bg-accent/60 h-auto w-full rounded-2xl border"
      role="img"
      aria-label="Ilustración de un recorrido por etapas sobre un plano"
    >
      <g className="stroke-primary/15" strokeWidth="1">
        {Array.from({ length: 11 }, (_, i) => (
          <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2="320" />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 40} x2="400" y2={i * 40} />
        ))}
      </g>
      <path
        d="M-10 250 C 80 210, 140 280, 220 230 S 360 170, 420 200"
        className="stroke-primary/25 fill-none"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M70 90 L150 70 L190 140 L280 120 L320 210"
        className="stroke-primary fill-none"
        strokeWidth="3"
        strokeDasharray="7 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="54" y="74" width="32" height="32" rx="8" className="fill-foreground" />
      <path d="M62 96v-9h16v9M62 92h16" className="stroke-background fill-none" strokeWidth="2" />
      {[
        [150, 70],
        [190, 140],
        [280, 120],
        [320, 210],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="15" className="fill-primary" />
          <text
            x={cx}
            y={(cy ?? 0) + 5}
            textAnchor="middle"
            className="fill-primary-foreground text-[14px] font-semibold"
          >
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function Home() {
  return (
    <main>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.1fr_1fr] md:py-20">
        <div className="flex flex-col gap-6">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Tu viaje, planificado sobre el mapa
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg text-pretty">
            De una idea a un itinerario por días con alojamiento, restaurantes, transporte y
            presupuesto, usando datos reales con su fuente. Para una escapada de fin de semana o
            para varias semanas.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="cta" size="lg" className="h-11 px-5 text-base">
              <Link href="/trips/new">Planificar un viaje</Link>
            </Button>
            <span className="text-muted-foreground text-sm">Gratis y sin registro</span>
          </div>
        </div>
        <RouteIllustration />
      </section>

      <section aria-labelledby="como-funciona" className="bg-muted/40 border-y">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
          <h2 id="como-funciona" className="text-2xl font-semibold tracking-tight">
            Cómo funciona
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex gap-4">
                <span className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
                  <Icon className="size-5" aria-hidden />
                  <span className="sr-only">Paso {i + 1}</span>
                </span>
                <div>
                  <h3 className="font-medium">{title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="principios"
        className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16"
      >
        <h2 id="principios" className="text-2xl font-semibold tracking-tight">
          Datos en los que puedes confiar
        </h2>
        <dl className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-3">
          {PRINCIPLES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="border-primary/40 border-l-2 pl-4">
              <dt className="flex items-center gap-2 font-medium">
                <Icon className="text-primary size-4" aria-hidden />
                {title}
              </dt>
              <dd className="text-muted-foreground mt-2 text-sm">{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs sm:flex-row sm:justify-between sm:px-6">
          <span>TripMind · planificador de viajes</span>
          <span>Datos de mapas © colaboradores de OpenStreetMap (ODbL)</span>
        </div>
      </footer>
    </main>
  );
}
