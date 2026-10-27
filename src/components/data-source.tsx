import { Badge } from "@/components/ui/badge";
import type { Source } from "@/domain";
import { cn } from "@/lib/utils";

/** Etiqueta visible para datos que vienen de fixtures grabados (REQUISITOS §3.2). */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-amber-500/60 text-amber-800 dark:text-amber-300", className)}
    >
      Datos de demostración
    </Badge>
  );
}

/** Fuente de un dato externo, con enlace verificable si lo hay. */
export function DataSource({
  source,
  isDemo,
  className,
}: {
  source: Source;
  isDemo: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex flex-wrap items-center gap-2 text-xs",
        className,
      )}
    >
      <span>
        Fuente:{" "}
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {source.name}
          </a>
        ) : (
          source.name
        )}
        {source.attribution ? ` · ${source.attribution}` : null}
      </span>
      {isDemo ? <DemoBadge /> : null}
    </span>
  );
}
