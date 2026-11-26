import type { summarize, metricDelta } from "./metrics.js";
import type { checkPolicy } from "./policy.js";
type Summary = ReturnType<typeof summarize>;
function value(n: number | null, percentage: boolean) {
  return n === null
    ? "n/a"
    : percentage
      ? (n * 100).toFixed(2) + "%"
      : n.toFixed(4);
}
export function metricLines(summary: Summary) {
  function line(label: string, m: Summary["overall"]) {
    return (
      label +
      " " +
      (m.provisional ? "provisional" : "complete") +
      " | valid " +
      m.evaluatedQueries +
      "/" +
      m.totalQueries +
      " | errors " +
      m.evidenceErrorQueries +
      " | " +
      Object.entries(m.statusCounts)
        .map(([s, n]) => s + "=" + n)
        .join(" ") +
      " | hits@K " +
      value(m.hitRateAtK, true) +
      " @1 " +
      value(m.hitRateAt1, true) +
      " @3 " +
      value(m.hitRateAt3, true) +
      " | MRR " +
      value(m.mrrAtK, false) +
      " | coverage " +
      value(m.operationCoverage, true)
    );
  }
  return [
    line("Overall", summary.overall),
    ...summary.operations.map((op) => line(op.id, op)),
  ];
}
export function policyLines(policy: ReturnType<typeof checkPolicy> | null) {
  return policy
    ? [
        "Policy " + policy.verdict,
        ...policy.checks.map((c) =>
          [
            c.metric,
            c.operation ?? "overall",
            c.actual ?? "n/a",
            "minimum",
            c.threshold,
            c.verdict,
          ].join(" "),
        ),
      ]
    : [];
}
export function deltaLine(
  label: string,
  delta: ReturnType<typeof metricDelta>,
) {
  if (!delta) return label + " | delta unavailable";
  return (
    label +
    " | " +
    Object.entries(delta)
      .map(
        ([k, v]) =>
          k +
          " " +
          (v === null
            ? "n/a"
            : k === "mrrAtK"
              ? v.toFixed(4)
              : (v * 100).toFixed(2) + " pp"),
      )
      .join(" | ")
  );
}
