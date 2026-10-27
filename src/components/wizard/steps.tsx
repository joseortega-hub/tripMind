"use client";

import type { FieldErrors, WizardDraft } from "@/domain/wizard";

/** Props comunes de cada paso del asistente. */
export interface StepProps {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
  /** Errores del paso (solo se muestran tras intentar avanzar). */
  errors: FieldErrors;
}
