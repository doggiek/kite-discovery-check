import {
  candidate,
  content,
  detail,
  detailArgs,
  key,
  message,
  readRows,
  recordingSchema,
  searchArgs,
  version,
  type Config,
  type Operation,
} from "./model.js";

export type Status =
  | "DISCOVERED"
  | "QUERY_MISS"
  | "NOT_OBSERVED"
  | "CHECK_ERROR";
type Hit = { rank: number; card: string; url: string; method: string };
type Observation = {
  query: string[];
  refs: string[][];
  hit?: Hit;
  firstReturned?: {
    host: string;
    method: string;
    path: string;
    rank: number;
    card: string;
  };
  error?: string;
  inspected?: number;
};
export function evaluate(input: unknown) {
  const r = recordingSchema.parse(input),
    c = r.config;
  const commands = new Map(r.commands.map((v) => [key(v.argv), v]));
  let actual: string | null = null,
    versionError = "";
  try {
    actual = version(commands.get(key(["--version"])));
    if (actual !== c.ksearchVersion)
      throw new Error(
        "Expected ksearch " + c.ksearchVersion + ", observed " + actual,
      );
  } catch (e) {
    versionError = message(e);
  }
  function observe(op: Operation, q: string[]): Observation {
    const args = searchArgs(q, c.topK),
      refs = [["--version"], args];
    const out: Observation = { query: q, refs };
    try {
      if (versionError) throw new Error(versionError);
      const rows = readRows(commands.get(key(args)), q, c.topK);
      out.inspected = rows.length;
      const first = rows[0];
      if (first)
        out.firstReturned = {
          host: first.host,
          method: first.method,
          path: first.path,
          rank: first.rank,
          card: first.id,
        };
      for (const row of rows) {
        const expected = candidate(row, op, c.origin);
        const existing = commands.get(key(detailArgs(row.id)));
        if (!expected && !existing) continue;
        const known = detail.safeParse(existing?.output);
        if (
          !expected &&
          !(
            known.success &&
            known.data.url === c.origin + op.path &&
            known.data.method === op.method
          )
        )
          continue;
        const lookup = detailArgs(row.id);
        refs.push(lookup);
        const d = detail.safeParse(content(commands.get(key(lookup))));
        if (!d.success) throw new Error("Incompatible card detail");
        const card = d.data;
        if (
          !expected ||
          card.id !== row.id ||
          card.host !== row.host ||
          card.method !== row.method ||
          card.path !== row.path ||
          card.url !== c.origin + op.path
        )
          throw new Error("Ranked row contradicts card detail: " + row.id);
        out.hit ??= {
          rank: row.rank,
          card: row.id,
          url: card.url,
          method: card.method,
        };
      }
    } catch (e) {
      delete out.hit;
      out.error = message(e);
    }
    return out;
  }
  const results = c.operations.flatMap((op) => {
    const controls = op.controls.map((q) => observe(op, q));
    return op.primary.map((q) => {
      const primary = observe(op, q);
      let status: Status, reason: string;
      if (primary.error) {
        status = "CHECK_ERROR";
        reason = primary.error;
      } else if (primary.hit) {
        status = "DISCOVERED";
        reason = "Primary result and detail agree.";
      } else if (controls.some((v) => v.hit && !v.error)) {
        status = "QUERY_MISS";
        reason = "Only a control query located the verified operation.";
      } else if (controls.some((v) => v.error)) {
        status = "CHECK_ERROR";
        reason =
          "A necessary control failed: " + controls.find((v) => v.error)!.error;
      } else {
        status = "NOT_OBSERVED";
        reason =
          "All configured windows were examined without a verified match.";
      }
      return {
        id: op.id,
        method: op.method,
        url: c.origin + op.path,
        primary,
        controls,
        status,
        reason,
        publicRuleCheck:
          "Check task terms against the card job and inspect the exact route.",
        needsConfirmation:
          status === "NOT_OBSERVED"
            ? "Ask the merchant to confirm intended catalog exposure."
            : status === "CHECK_ERROR"
              ? "Resolve the evidence error before interpreting visibility."
              : null,
      };
    });
  });
  return {
    kind: r.kind,
    at: r.at,
    actualVersion: actual,
    expectedVersion: c.ksearchVersion,
    topK: c.topK,
    results,
  };
}
export type Report = ReturnType<typeof evaluate>;
export function exitCode(report: Report) {
  return report.results.some((v) => v.status === "CHECK_ERROR")
    ? 2
    : report.results.some((v) => v.status !== "DISCOVERED")
      ? 1
      : 0;
}

export function compare(before: unknown, after: unknown) {
  const a = recordingSchema.parse(before),
    b = recordingSchema.parse(after);
  const older = evaluate(a),
    newer = evaluate(b);
  function signature(config: Config) {
    return key(
      config.operations
        .map((o) =>
          JSON.stringify([
            config.origin,
            config.topK,
            o.id,
            o.method,
            o.path,
            o.primary,
            o.controls,
          ]),
        )
        .sort(),
    );
  }
  const comparable = signature(a.config) === signature(b.config);
  const stamp = (r: Report) => ({
    version: r.actualVersion,
    expectedVersion: r.expectedVersion,
    at: r.at,
    kind: r.kind,
  });
  const prev = new Map(
    older.results.map((v) => [key([v.id, ...v.primary.query]), v]),
  );
  const changes = comparable
    ? newer.results.map((next) => {
        const old = prev.get(key([next.id, ...next.primary.query]))!;
        const state = (v: typeof old) => ({
          status: v.status,
          rank: v.primary.hit?.rank ?? null,
        });
        let trend = "unchanged";
        if (next.status === "CHECK_ERROR" || old.status === "CHECK_ERROR")
          trend = "indeterminate";
        else if (next.status === "DISCOVERED" && old.status === "DISCOVERED") {
          const delta = next.primary.hit!.rank - old.primary.hit!.rank;
          trend =
            delta < 0 ? "improved" : delta > 0 ? "regressed" : "unchanged";
        } else if (next.status !== old.status) {
          trend =
            next.status === "DISCOVERED"
              ? "improved"
              : old.status === "DISCOVERED"
                ? "regressed"
                : "control-visibility-changed";
        }
        return {
          id: next.id,
          query: next.primary.query,
          before: state(old),
          after: state(next),
          trend,
        };
      })
    : [];
  return {
    comparable,
    before: stamp(older),
    after: stamp(newer),
    reason: comparable
      ? "Same targets, ordered queries and window. Client and catalog may both change."
      : "Target set, origin, method, path, ordered queries or Top K differ.",
    changes,
  };
}
