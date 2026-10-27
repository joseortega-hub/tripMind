"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createEmptyDraft, WIZARD_STEPS, type WizardDraft } from "@/domain/wizard";

interface WizardState {
  draft: WizardDraft;
  /** Paso actual (índice en `WIZARD_STEPS`). */
  step: number;
  /** Paso más avanzado alcanzado: se puede volver a cualquiera anterior desde el indicador. */
  furthestStep: number;
  update: (patch: Partial<WizardDraft>) => void;
  goTo: (step: number) => void;
  reset: () => void;
}

export const DRAFT_STORAGE_KEY = "tripmind:wizard-draft";

/** Borrador del asistente persistido en localStorage para no perderlo al recargar. */
export const useWizardStore = create<WizardState>()(
  persist(
    (set) => ({
      draft: createEmptyDraft(),
      step: 0,
      furthestStep: 0,
      update: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
      goTo: (step) =>
        set((state) => {
          const next = Math.min(Math.max(step, 0), WIZARD_STEPS.length - 1);
          return { step: next, furthestStep: Math.max(state.furthestStep, next) };
        }),
      reset: () => set({ draft: createEmptyDraft(), step: 0, furthestStep: 0 }),
    }),
    {
      name: DRAFT_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Se rehidrata tras montar para evitar diferencias entre servidor y cliente.
      skipHydration: true,
      partialize: ({ draft, step, furthestStep }) => ({ draft, step, furthestStep }),
      // Un borrador de otra versión se descarta en lugar de arriesgar datos incompatibles.
      migrate: () => ({ draft: createEmptyDraft(), step: 0, furthestStep: 0 }),
    },
  ),
);
