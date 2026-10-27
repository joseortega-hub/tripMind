import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Auditoría axe WCAG 2.2 AA: falla con infracciones graves o críticas (docs/DISENO.md). */
export async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    // El indicador de desarrollo de Next.js no forma parte de la aplicación.
    .exclude("nextjs-portal")
    .analyze();
  const serious = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
  expect(serious).toEqual([]);
}
