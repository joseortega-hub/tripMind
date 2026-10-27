"use client";

import { useMutation } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TripOverview } from "@/components/trip-overview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { buildTripInput, validateStep, WIZARD_STEPS, type WizardStep } from "@/domain/wizard";
import { ApiError, postJson } from "@/lib/api-client";
import { STEP_LABELS } from "@/lib/trip-labels";
import { cn } from "@/lib/utils";
import { AccommodationStep } from "./accommodation-step";
import { BudgetStep } from "./budget-step";
import { DestinationStep } from "./destination-step";
import { Field } from "./field";
import { InterestsStep } from "./interests-step";
import { PaceStep } from "./pace-step";
import type { StepProps } from "./steps";
import { useWizardStore } from "./store";

const STEP_COMPONENTS: Record<
  Exclude<WizardStep, "summary">,
  (props: StepProps) => React.ReactNode
> = {
  destination: DestinationStep,
  accommodation: AccommodationStep,
  interests: InterestsStep,
  pace: PaceStep,
  budget: BudgetStep,
};

const STEP_INTROS: Record<WizardStep, string> = {
  destination: "Elige el destino y cuándo viajas.",
  accommodation: "Si ya tienes alojamiento lo usaremos como punto de partida.",
  interests: "Lo usaremos para elegir y ordenar las visitas.",
  pace: "Cuántas cosas por día y en qué horario.",
  budget: "Cuánto quieres gastar, en total o por partidas.",
  summary: "Revisa los datos antes de crear el viaje.",
};

/** Rehidrata el borrador desde localStorage tras montar (evita desajustes de hidratación). */
function useHydratedStore() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    void Promise.resolve(useWizardStore.persist.rehydrate()).then(() => setHydrated(true));
  }, []);
  return hydrated;
}

export function TripWizard() {
  const router = useRouter();
  const hydrated = useHydratedStore();
  const { draft, step, furthestStep, update, goTo, reset } = useWizardStore();
  const [attempted, setAttempted] = useState<Partial<Record<WizardStep, boolean>>>({});
  const [focusRequest, setFocusRequest] = useState<"heading" | "invalid" | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const current = WIZARD_STEPS[step] ?? "destination";
  const validation = validateStep(current, draft);
  const errors = attempted[current] && !validation.success ? validation.errors : {};
  const isLast = current === "summary";

  const create = useMutation({
    mutationFn: async () => {
      const result = buildTripInput(draft);
      if (!result.success) throw new Error("Faltan datos por completar.");
      return postJson<{ id: string }>("/api/trips", result.data);
    },
    onSuccess: ({ id }) => {
      router.push(`/trips/${id}`);
      reset();
    },
  });

  // Gestión del foco: al cambiar de paso, al título; al fallar la validación, al primer error.
  useEffect(() => {
    if (focusRequest === "heading") headingRef.current?.focus();
    if (focusRequest === "invalid") {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
    if (focusRequest) setFocusRequest(null);
  }, [focusRequest]);

  const move = (target: number) => {
    goTo(target);
    setFocusRequest("heading");
    window.scrollTo({ top: 0 });
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validation.success) {
      setAttempted((prev) => ({ ...prev, [current]: true }));
      setFocusRequest("invalid");
      return;
    }
    if (isLast) create.mutate();
    else move(step + 1);
  };

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando el asistente">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const StepComponent = isLast ? null : STEP_COMPONENTS[current];
  const errorCount = Object.keys(errors).length;

  return (
    <div className="grid gap-8 md:grid-cols-[13rem_1fr]">
      <nav aria-label="Pasos del asistente" className="hidden md:block">
        <ol className="sticky top-6 flex flex-col gap-1">
          {WIZARD_STEPS.map((id, index) => {
            const done = index < step || (index <= furthestStep && index !== step);
            const reachable = index <= furthestStep && index !== step;
            const content = (
              <>
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums",
                    index === step && "border-primary bg-primary text-primary-foreground",
                    done && index !== step && "border-primary text-primary",
                  )}
                  aria-hidden
                >
                  {done && index !== step ? <Check className="size-3.5" /> : index + 1}
                </span>
                {STEP_LABELS[id]}
              </>
            );
            return (
              <li key={id}>
                {reachable ? (
                  <button
                    type="button"
                    onClick={() => move(index)}
                    className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-3"
                  >
                    {content}
                  </button>
                ) : (
                  <span
                    aria-current={index === step ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 px-2 py-1.5 text-sm",
                      index === step ? "text-foreground font-medium" : "text-muted-foreground",
                    )}
                  >
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-2 md:hidden">
          <p className="text-muted-foreground text-sm">
            Paso {step + 1} de {WIZARD_STEPS.length}
          </p>
          <Progress
            value={((step + 1) / WIZARD_STEPS.length) * 100}
            aria-label={`Paso ${step + 1} de ${WIZARD_STEPS.length}`}
          />
        </div>

        <header className="flex flex-col gap-1">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight outline-none"
          >
            {STEP_LABELS[current]}
          </h2>
          <p className="text-muted-foreground">{STEP_INTROS[current]}</p>
        </header>

        {errorCount > 0 ? (
          <p role="alert" className="text-destructive text-sm font-medium">
            {errorCount === 1
              ? "Revisa el campo marcado."
              : `Revisa los ${errorCount} campos marcados.`}
          </p>
        ) : null}

        {StepComponent ? (
          <StepComponent draft={draft} update={update} errors={errors} />
        ) : (
          <SummaryStep onEdit={(target) => move(WIZARD_STEPS.indexOf(target))} />
        )}

        {create.error ? (
          <Alert variant="destructive">
            <AlertTitle>No se ha podido crear el viaje</AlertTitle>
            <AlertDescription>
              {create.error instanceof ApiError || create.error instanceof Error
                ? create.error.message
                : "Error desconocido."}{" "}
              Tu borrador sigue guardado; puedes volver a intentarlo.
            </AlertDescription>
          </Alert>
        ) : null}

        {/* En móvil la navegación queda fija abajo, al alcance del pulgar (docs/DISENO.md). */}
        <div className="bg-background/95 sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6 md:static md:mx-0 md:bg-transparent md:px-0 md:pt-4 md:pb-0 md:backdrop-blur-none">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-11"
            disabled={step === 0 || create.isPending}
            onClick={() => move(step - 1)}
          >
            Atrás
          </Button>
          <Button
            type="submit"
            variant="cta"
            size="lg"
            className="h-11 min-w-32 px-5"
            disabled={create.isPending}
          >
            {isLast ? (
              create.isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Creando viaje…
                </>
              ) : (
                "Crear viaje"
              )
            ) : (
              "Siguiente"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function SummaryStep({ onEdit }: { onEdit: (step: WizardStep) => void }) {
  const draft = useWizardStore((state) => state.draft);
  const update = useWizardStore((state) => state.update);
  const result = buildTripInput(draft);

  if (!result.success) {
    const pending = result.errors.step as WizardStep | undefined;
    return (
      <Alert variant="destructive">
        <AlertTitle>Faltan datos</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <p>
            {pending
              ? `Completa el paso «${STEP_LABELS[pending]}» antes de crear el viaje.`
              : "Hay datos no válidos en el borrador."}
          </p>
          {pending ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => onEdit(pending)}
            >
              Ir a {STEP_LABELS[pending]}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Field
        id="title"
        label="Nombre del viaje (opcional)"
        hint={`Si lo dejas vacío lo llamaremos «${draft.destination?.name ?? "Mi viaje"}».`}
      >
        <Input
          id="title"
          maxLength={120}
          className="h-11 text-base sm:h-9 sm:text-sm"
          placeholder={`Viaje a ${draft.destination?.name ?? ""}`}
          value={draft.title}
          onChange={(event) => update({ title: event.target.value })}
          aria-describedby="title-hint"
        />
      </Field>
      <div className="rounded-xl border px-4">
        <TripOverview
          trip={result.data}
          renderEdit={(step, label) => (
            <Button
              type="button"
              variant="link"
              className="h-11 px-2"
              aria-label={`Editar ${label.toLowerCase()}`}
              onClick={() => onEdit(step)}
            >
              Editar
            </Button>
          )}
        />
      </div>
    </div>
  );
}
