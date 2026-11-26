import { z } from "zod";
import type { summarize } from "./metrics.js";
const threshold = z.number().min(0).max(1).optional();
export const policySchema = z
  .object({
    schemaVersion: z.literal(1),
    thresholds: z
      .object({
        minHitRateAtK: threshold,
        minMRRAtK: threshold,
        minOperationHitRateAtK: threshold,
      })
      .strict()
      .refine(
        (t) => Object.values(t).some((v) => v !== undefined),
        "Provide at least one threshold",
      ),
  })
  .strict();

export function checkPolicy(
  summary: ReturnType<typeof summarize>,
  policy: z.infer<typeof policySchema>,
) {
  const checks: {
    metric: keyof typeof policy.thresholds;
    operation: string | null;
    actual: number | null;
    threshold: number;
    verdict: "pass" | "fail" | "indeterminate";
  }[] = [];
  function check(
    metric: keyof typeof policy.thresholds,
    actual: number | null,
    operation: string | null = null,
  ) {
    const minimum = policy.thresholds[metric];
    if (minimum === undefined) return;
    checks.push({
      metric,
      operation,
      actual,
      threshold: minimum,
      verdict:
        summary.overall.provisional || actual === null
          ? "indeterminate"
          : actual >= minimum
            ? "pass"
            : "fail",
    });
  }
  check("minHitRateAtK", summary.overall.hitRateAtK);
  check("minMRRAtK", summary.overall.mrrAtK);
  for (const op of summary.operations)
    check("minOperationHitRateAtK", op.hitRateAtK, op.id);
  return {
    verdict: summary.overall.provisional
      ? "indeterminate"
      : checks.some((c) => c.verdict === "fail")
        ? "fail"
        : "pass",
    checks,
  };
}
