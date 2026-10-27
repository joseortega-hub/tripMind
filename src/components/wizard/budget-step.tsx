"use client";

import { Input } from "@/components/ui/input";
import { type BudgetCategory, BudgetCategorySchema } from "@/domain";
import { BUDGET_CATEGORY_LABELS, CURRENCIES, formatMoney } from "@/lib/trip-labels";
import { describedBy, Field, NativeSelect, parseOptionalNumber } from "./field";
import type { StepProps } from "./steps";

export function BudgetStep({ draft, update, errors }: StepProps) {
  const { budget } = draft;
  const sum = Object.values(budget.categories).reduce((total, value) => total + (value ?? 0), 0);
  const categoriesError = errors["budget.categories"];

  const setCategory = (category: BudgetCategory, value: number | undefined) => {
    const categories = { ...budget.categories };
    if (value === undefined) delete categories[category];
    else categories[category] = value;
    update({ budget: { ...budget, categories } });
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        Todo es opcional. Es tu presupuesto objetivo: al planificar distinguiremos los precios
        confirmados, los orientativos y los que no tienen precio conocido.
      </p>
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Field id="currency" label="Moneda">
          <NativeSelect
            id="currency"
            value={budget.currency}
            onChange={(event) => update({ budget: { ...budget, currency: event.target.value } })}
          >
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="budgetTotal" label="Presupuesto total del viaje" error={errors["budget.total"]}>
          <Input
            id="budgetTotal"
            type="number"
            inputMode="decimal"
            min={0}
            className="h-11 text-base sm:h-9 sm:text-sm"
            value={budget.total ?? ""}
            onChange={(event) =>
              update({ budget: { ...budget, total: parseOptionalNumber(event.target.value) } })
            }
            {...describedBy("budgetTotal", errors["budget.total"])}
          />
        </Field>
      </div>

      <fieldset aria-describedby={categoriesError ? "categories-error" : "categories-sum"}>
        <legend className="mb-4 text-sm font-medium">Por partidas</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {BudgetCategorySchema.options.map((category) => {
            const id = `budget-${category}`;
            return (
              <Field key={category} id={id} label={BUDGET_CATEGORY_LABELS[category]}>
                <Input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  className="h-11 text-base sm:h-9 sm:text-sm"
                  value={budget.categories[category] ?? ""}
                  aria-invalid={categoriesError ? true : undefined}
                  onChange={(event) =>
                    setCategory(category, parseOptionalNumber(event.target.value))
                  }
                />
              </Field>
            );
          })}
        </div>
        <p id="categories-sum" className="text-muted-foreground mt-3 text-sm" aria-live="polite">
          Suma de partidas: {formatMoney(sum, budget.currency)}
          {budget.total !== undefined ? ` de ${formatMoney(budget.total, budget.currency)}` : null}
        </p>
        {categoriesError ? (
          <p id="categories-error" className="text-destructive mt-1 text-sm">
            {categoriesError}
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}
