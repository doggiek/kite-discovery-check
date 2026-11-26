import type { Report, Status } from "./evaluate.js";

type Results = Report["results"];
function metrics(results: Results, topK: number) {
  const statusCounts: Record<Status, number> = {
    DISCOVERED: 0,
    QUERY_MISS: 0,
    NOT_OBSERVED: 0,
    CHECK_ERROR: 0,
  };
  const operations = new Set<string>(),
    covered = new Set<string>();
  let first = 0,
    firstThree = 0,
    reciprocal = 0;
  for (const result of results) {
    statusCounts[result.status]++;
    operations.add(result.id);
    if (result.status !== "DISCOVERED") continue;
    const rank = result.primary.hit!.rank;
    covered.add(result.id);
    if (rank === 1) first++;
    if (rank <= 3) firstThree++;
    reciprocal += 1 / rank;
  }
  const totalQueries = results.length,
    evidenceErrorQueries = statusCounts.CHECK_ERROR;
  const evaluatedQueries = totalQueries - evidenceErrorQueries;
  const rate = (sum: number) =>
    evaluatedQueries ? sum / evaluatedQueries : null;
  return {
    provisional: evidenceErrorQueries > 0,
    totalQueries,
    evaluatedQueries,
    evidenceErrorQueries,
    discoveredQueries: statusCounts.DISCOVERED,
    statusCounts,
    hitRateAtK: rate(statusCounts.DISCOVERED),
    hitRateAt1: rate(first),
    hitRateAt3: topK >= 3 ? rate(firstThree) : null,
    mrrAtK: rate(reciprocal),
    operationCoverage: evaluatedQueries ? covered.size / operations.size : null,
  };
}
export function summarize(report: Report) {
  const groups = new Map<string, Results>();
  for (const result of report.results) {
    const group = groups.get(result.id);
    if (group) group.push(result);
    else groups.set(result.id, [result]);
  }
  return {
    overall: metrics(report.results, report.topK),
    operations: [...groups].map(([id, results]) => ({
      id,
      ...metrics(results, report.topK),
    })),
  };
}
type Metrics = ReturnType<typeof metrics>;
export function metricDelta(before: Metrics, after: Metrics) {
  if (before.provisional || after.provisional) return null;
  const diff = (a: number | null, b: number | null) =>
    a === null || b === null ? null : b - a;
  return {
    hitRateAtK: diff(before.hitRateAtK, after.hitRateAtK),
    hitRateAt1: diff(before.hitRateAt1, after.hitRateAt1),
    hitRateAt3: diff(before.hitRateAt3, after.hitRateAt3),
    mrrAtK: diff(before.mrrAtK, after.mrrAtK),
    operationCoverage: diff(before.operationCoverage, after.operationCoverage),
  };
}
