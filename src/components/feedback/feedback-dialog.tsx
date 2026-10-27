"use client";

import { useMutation } from "@tanstack/react-query";
import {
  Bug,
  CheckCircle2,
  ImagePlus,
  Info,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  Sparkles,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  FEEDBACK_MAX_IMAGES,
  FEEDBACK_MAX_MESSAGE,
  feedbackProblem,
  type FeedbackImage,
  type FeedbackInput,
  type FeedbackKind,
} from "@/domain/feedback";
import { postJson } from "@/lib/api-client";
import {
  compressImage,
  feedbackContext,
  onOpenFeedback,
  openFeedback,
  tripIdFromPath,
} from "@/lib/feedback";
import { cn } from "@/lib/utils";

const KINDS: { value: FeedbackKind; title: string; hint: string; icon: typeof Bug }[] = [
  { value: "error", title: "Error", hint: "¿Qué no funciona como debería?", icon: Bug },
  { value: "idea", title: "Idea", hint: "¿Qué te gustaría que hiciera TripMind?", icon: Lightbulb },
  {
    value: "mejora",
    title: "Mejora",
    hint: "¿Qué cambiarías de lo que ya existe?",
    icon: Sparkles,
  },
];

const PLACEHOLDER: Record<FeedbackKind, string> = {
  error: "Qué hacías, qué esperabas y qué ha pasado.",
  idea: "Cuéntala con el detalle que quieras.",
  mejora: "Qué pantalla es y cómo te resultaría más cómoda.",
};

/**
 * Buzón de ideas, mejoras y errores. Se monta una vez en el layout y se abre con
 * `openFeedback()`; la pantalla, el viaje y el contexto técnico se adjuntan solos.
 * En móvil es una hoja inferior; desde `sm` un diálogo centrado.
 */
export function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("error");
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<FeedbackImage[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pathname = usePathname() ?? "/";
  const tripId = tripIdFromPath(pathname);
  const textId = useId();
  const fileInput = useRef<HTMLInputElement>(null);

  // Se abre por evento (sin Trigger de Radix): el foco vuelve a mano a quien lo abrió.
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(
    () =>
      onOpenFeedback(() => {
        returnFocus.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setOpen(true);
      }),
    [],
  );

  const send = useMutation({
    mutationFn: () =>
      postJson<{ id: string }>("/api/feedback", {
        kind,
        message: message.trim(),
        path: pathname,
        tripId,
        context: feedbackContext(),
        images,
      } satisfies FeedbackInput),
  });

  const reset = () => {
    setKind("error");
    setMessage("");
    setImages([]);
    setProblem(null);
    send.reset();
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    // Tras un envío correcto se empieza de cero; si se cierra a medias se conserva el borrador.
    if (!next && send.isSuccess) reset();
  };

  const addFiles = async (files: File[]) => {
    setProblem(null);
    setCompressing(true);
    try {
      const room = FEEDBACK_MAX_IMAGES - images.length;
      const ready: FeedbackImage[] = [];
      for (const file of files.slice(0, room)) ready.push(await compressImage(file));
      setImages((prev) => [...prev, ...ready].slice(0, FEEDBACK_MAX_IMAGES));
      if (files.length > room)
        setProblem(`Puedes adjuntar como mucho ${FEEDBACK_MAX_IMAGES} imágenes.`);
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "No se ha podido preparar la imagen.");
    } finally {
      setCompressing(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found = feedbackProblem({ message, images });
    setProblem(found);
    if (!found) send.mutate();
  };

  const current = KINDS.find((k) => k.value === kind)!;
  const error =
    problem ??
    (send.isError
      ? send.error instanceof Error
        ? send.error.message
        : "No se ha podido enviar. Revisa tu conexión y vuelve a probar."
      : null);
  const full = images.length >= FEEDBACK_MAX_IMAGES;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40 motion-reduce:animate-none" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            if (!returnFocus.current?.isConnected) return;
            event.preventDefault();
            returnFocus.current.focus();
          }}
          className={cn(
            "bg-background fixed z-50 flex max-h-[92dvh] w-full flex-col shadow-xl outline-none",
            "inset-x-0 bottom-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]",
            "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[85dvh] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-0",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4 motion-reduce:animate-none",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-0.5">
              <Dialog.Title className="text-lg font-semibold tracking-tight">
                Buzón de ideas y errores
              </Dialog.Title>
              <Dialog.Description className="text-muted-foreground text-sm">
                Lo leemos todo. No hace falta que dejes tus datos.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="size-11 shrink-0">
                <X className="size-5" aria-hidden />
                <span className="sr-only">Cerrar el buzón</span>
              </Button>
            </Dialog.Close>
          </div>

          {send.isSuccess ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center sm:px-6">
              <CheckCircle2 className="text-primary size-10" aria-hidden />
              <p role="status" className="text-lg font-medium">
                ¡Gracias! Lo hemos recibido.
              </p>
              <p className="text-muted-foreground max-w-xs text-sm">
                Lo revisaremos con calma. Si se te ocurre algo más, puedes enviar otro.
              </p>
              <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                <Button variant="outline" className="h-11 px-4" onClick={reset}>
                  Enviar otro
                </Button>
                <Dialog.Close asChild>
                  <Button className="h-11 px-4">Cerrar</Button>
                </Dialog.Close>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 sm:px-6">
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-medium">¿Qué quieres contarnos?</legend>
                  <RadioGroup
                    value={kind}
                    onValueChange={(next) => setKind(next as FeedbackKind)}
                    className="grid grid-cols-3 gap-2"
                  >
                    {KINDS.map(({ value, title, icon: Icon }) => (
                      <Label
                        key={value}
                        htmlFor={`feedback-kind-${value}`}
                        className={cn(
                          "relative flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border p-2 text-sm font-medium transition-colors motion-reduce:transition-none",
                          "hover:bg-muted has-data-checked:border-cta has-data-checked:bg-accent/60",
                          "has-focus-visible:ring-ring/50 has-focus-visible:ring-3",
                        )}
                      >
                        <RadioGroupItem
                          id={`feedback-kind-${value}`}
                          value={value}
                          className="sr-only"
                        />
                        <Icon className="text-primary size-5" aria-hidden />
                        {title}
                      </Label>
                    ))}
                  </RadioGroup>
                </fieldset>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={textId}>{current.hint}</Label>
                  <Textarea
                    id={textId}
                    value={message}
                    onChange={(event) =>
                      setMessage(event.target.value.slice(0, FEEDBACK_MAX_MESSAGE))
                    }
                    rows={5}
                    maxLength={FEEDBACK_MAX_MESSAGE}
                    placeholder={PLACEHOLDER[kind]}
                    aria-describedby={`${textId}-count`}
                    className="min-h-28 resize-y"
                  />
                  <p
                    id={`${textId}-count`}
                    className="text-muted-foreground self-end text-xs tabular-nums"
                  >
                    {message.length}/{FEEDBACK_MAX_MESSAGE}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">
                    Capturas o fotos{" "}
                    <span className="text-muted-foreground font-normal tabular-nums">
                      ({images.length}/{FEEDBACK_MAX_IMAGES}, opcional)
                    </span>
                  </p>
                  <ul className="flex flex-wrap gap-2" aria-label="Imágenes adjuntas">
                    {images.map((image, index) => (
                      <li
                        key={index}
                        className="bg-muted relative size-20 overflow-hidden rounded-lg border"
                      >
                        {/* data URL local: next/image no aporta nada aquí. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`data:${image.type};base64,${image.data}`}
                          alt={`Imagen adjunta ${index + 1}`}
                          className="size-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}
                          className="absolute top-0 right-0 grid size-11 place-items-center outline-none focus-visible:ring-3 focus-visible:ring-white"
                        >
                          <span className="grid size-7 place-items-center rounded-full bg-black/75 text-white">
                            <X className="size-4" aria-hidden />
                          </span>
                          <span className="sr-only">Quitar la imagen {index + 1}</span>
                        </button>
                      </li>
                    ))}
                    {!full && (
                      <li>
                        <button
                          type="button"
                          onClick={() => fileInput.current?.click()}
                          disabled={compressing}
                          aria-busy={compressing || undefined}
                          className="text-muted-foreground hover:border-primary hover:text-foreground focus-visible:ring-ring/50 grid size-20 place-items-center rounded-lg border border-dashed transition-colors outline-none focus-visible:ring-3 disabled:cursor-wait motion-reduce:transition-none"
                        >
                          {compressing ? (
                            <Loader2
                              className="size-6 animate-spin motion-reduce:animate-none"
                              aria-hidden
                            />
                          ) : (
                            <ImagePlus className="size-6" aria-hidden />
                          )}
                          <span className="sr-only">
                            {compressing ? "Preparando la imagen…" : "Añadir una captura o foto"}
                          </span>
                        </button>
                      </li>
                    )}
                  </ul>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    data-testid="feedback-file"
                    onChange={(event) => {
                      const files = [...(event.target.files ?? [])];
                      event.target.value = "";
                      if (files.length) void addFiles(files);
                    }}
                  />
                  <p className="text-muted-foreground text-xs">
                    Se comprimen en tu dispositivo antes de enviarlas.
                  </p>
                </div>

                <p className="bg-muted text-muted-foreground flex items-start gap-2 rounded-md px-3 py-2 text-xs">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    Se envía también la pantalla ({pathname}){tripId ? ", el viaje" : ""}, el tamaño
                    de pantalla y el navegador. Nada personal.
                  </span>
                </p>
              </div>

              <div className="flex flex-col gap-2 border-t px-4 py-3 sm:px-6">
                {error ? (
                  <p role="alert" className="text-destructive text-sm">
                    {error}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  variant="cta"
                  className="h-11 w-full text-base"
                  disabled={send.isPending || compressing}
                >
                  {send.isPending ? "Enviando…" : "Enviar"}
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Botón «Buzón» de la cabecera: abre el diálogo montado en el layout. */
export function FeedbackButton() {
  return (
    <button
      type="button"
      onClick={openFeedback}
      aria-haspopup="dialog"
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-3"
    >
      <MessageSquarePlus className="size-4" aria-hidden />
      Buzón
    </button>
  );
}
