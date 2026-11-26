import { summarize } from "../dist/metrics.js";
import { checkPolicy, policySchema } from "../dist/policy.js";
import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, compare, exitCode } from "../dist/evaluate.js";
import { configSchema, searchArgs, detailArgs } from "../dist/model.js";
import { readFileSync } from "node:fs";

const id = "1234567890abcdef12345678",
  host = "tickets.example",
  path = "/v1/venue",
  at = "2026-01-02T00:00:00Z";
const hit = { id, host, path, method: "GET", rank: 1 },
  other = { ...hit, id: "abcdabcdabcdabcdabcdabcd", host: "elsewhere.example" };
const card = { id, host, path, method: "GET", url: "https://" + host + path };
function fixture(primary = [hit], control = []) {
  const config = {
    schemaVersion: 1,
    ksearchVersion: "1.2.3",
    topK: 2,
    origin: "https://" + host,
    operations: [
      {
        id: "venue",
        method: "GET",
        path,
        primary: [["venue"]],
        controls: [["hall"]],
      },
    ],
  };
  const command = (argv, output) => ({ argv, at, exitCode: 0, output });
  const page = (word, rows) =>
    command(searchArgs([word], 2), {
      query: { words: [word], top: 2, dropped: [] },
      matched: rows.length,
      shown: rows.length,
      lines: rows,
    });
  return {
    format: 1,
    kind: "synthetic",
    config,
    at,
    commands: [
      command(["--version"], "ksearch 1.2.3"),
      page("venue", primary),
      page("hall", control),
      command(detailArgs(id), card),
    ],
  };
}
const status = (r) => evaluate(r).results[0].status;
test("pinned public observations and deterministic replay", () => {
  for (const [name, expected] of [
    [
      "agent402",
      [
        ["DISCOVERED", 1],
        ["NOT_OBSERVED", undefined],
      ],
    ],
    [
      "oblique",
      [
        ["DISCOVERED", 1],
        ["QUERY_MISS", undefined],
      ],
    ],
  ]) {
    const r = JSON.parse(
      readFileSync(
        new URL("../examples/recordings/" + name + ".json", import.meta.url),
      ),
    );
    const a = evaluate(r);
    assert.deepEqual(a, evaluate(r));
    assert.deepEqual(
      a.results.map((v) => [v.status, v.primary.hit?.rank]),
      expected,
    );
    assert.equal(exitCode(a), 1);
  }
});
for (const [label, change] of Object.entries({
  domain: { host: "tickets.example.evil.invalid" },
  method: { method: "POST" },
  path: { path: path + "/extra" },
})) {
  test("reject near match: " + label, () =>
    assert.equal(
      status(fixture([{ ...other, ...hit, ...change, id: other.id }])),
      "NOT_OBSERVED",
    ),
  );
}
test("verified control decides a primary miss; primary queries are independent", () => {
  const r = fixture([], [hit]);
  r.config.operations[0].primary.push(["entry"]);
  const cmd = structuredClone(r.commands[2]);
  cmd.argv = searchArgs(["entry"], 2);
  cmd.output.query.words = ["entry"];
  r.commands.push(cmd);
  assert.deepEqual(
    evaluate(r).results.map((v) => v.status),
    ["QUERY_MISS", "DISCOVERED"],
  );
});
const errors = {
  "missing card": (r) => r.commands.pop(),
  "nonzero exit": (r) => (r.commands[1].exitCode = 7),
  timeout: (r) => (r.commands[1].error = "ETIMEDOUT"),
  "invalid JSON": (r) => (r.commands[1].error = "Invalid JSON on stdout"),
  "malformed page": (r) => delete r.commands[1].output.lines,
  "truncated window": (r) => (r.commands[1].output.matched = 2),
  "bad rank": (r) => (r.commands[1].output.lines = [{ ...hit, rank: 2 }]),
  "version mismatch": (r) => (r.config.ksearchVersion = "9.0.0"),
  "wrong argv": (r) => (r.commands[1].argv[2] = "other"),
  "wrong query echo": (r) => (r.commands[1].output.query.words = ["other"]),
  "dropped words": (r) => (r.commands[1].output.query.dropped = ["venue"]),
  "wrong detail URL": (r) =>
    (r.commands[3].output = { ...card, url: "http://" + host + path }),
  "wrong detail ID": (r) => (r.commands[3].output = { ...card, id: other.id }),
  "wrong detail method": (r) =>
    (r.commands[3].output = { ...card, method: "POST" }),
};
for (const [label, mutate] of Object.entries(errors))
  test("CHECK_ERROR for " + label, () => {
    const r = fixture();
    mutate(r);
    assert.equal(status(r), "CHECK_ERROR");
    assert.equal(exitCode(evaluate(r)), 2);
  });
test("failed necessary control does not become absence", () => {
  const r = fixture([]);
  r.commands.splice(2, 1);
  assert.equal(status(r), "CHECK_ERROR");
});
test("evidence for a hit survives unrelated control failure", () => {
  const r = fixture();
  r.commands.splice(2, 1);
  assert.equal(exitCode(evaluate(r)), 0);
});
test("comparison observes visibility and ranks across verified versions", () => {
  const old = fixture([], [hit]),
    now = fixture();
  now.config.ksearchVersion = "1.2.4";
  now.commands[0].output = "ksearch 1.2.4";
  assert.equal(compare(old, now).changes[0].trend, "improved");
  assert.equal(compare(now, old).changes[0].trend, "regressed");
  const lower = fixture([other, { ...hit, rank: 2 }]);
  assert.equal(compare(now, lower).changes[0].trend, "regressed");
  assert.equal(compare(lower, now).changes[0].trend, "improved");
  assert.equal(compare(now, now).changes[0].trend, "unchanged");
  now.commands.pop();
  assert.equal(compare(old, now).changes[0].trend, "indeterminate");
});
test("reject incompatible query order, target, and window", () => {
  for (const change of [
    (r) => (r.config.topK = 3),
    (r) => (r.config.operations[0].primary = [["tasks", "venue"]]),
    (r) => (r.config.operations[0].path = "/other"),
  ]) {
    const a = fixture(),
      b = fixture();
    change(b);
    assert.equal(compare(a, b).comparable, false);
  }
  const a = fixture(),
    b = fixture();
  a.config.operations[0].primary = [["venue", "live"]];
  b.config.operations[0].primary = [["live", "venue"]];
  assert.equal(compare(a, b).comparable, false);
});
test("strict configuration and static routes", () => {
  for (const mutate of [
    (c) => (c.origin = "http://test.invalid"),
    (c) => (c.origin += "/x"),
    (c) => (c.topK = 0),
    (c) => (c.operations[0].path = "/a/../b"),
    (c) => (c.operations[0].path = "/{id}"),
    (c) => (c.operations[0].primary = [["--base-url"]]),
    (c) => c.operations.push(c.operations[0]),
    (c) => (c.unused = true),
  ]) {
    const c = fixture().config;
    mutate(c);
    assert.equal(configSchema.safeParse(c).success, false);
  }
});

test("a later contradictory candidate invalidates the primary rank even with a good control", () => {
  const conflicting = { ...hit, id: other.id, rank: 2 };
  const r = fixture([hit, conflicting], [hit]);
  r.commands.push({
    ...r.commands[3],
    argv: detailArgs(other.id),
    output: { ...card, id: other.id, method: "POST" },
  });
  const result = compare(fixture(), r).changes[0];
  assert.deepEqual(result.after, { status: "CHECK_ERROR", rank: null });
  assert.equal(result.trend, "indeterminate");
  assert.equal(evaluate(r).results[0].primary.hit, undefined);
});

test("case variants of one ksearch query cannot serve as independent controls", () => {
  const config = fixture().config;
  config.operations[0].controls = [["VENUE"]];
  assert.equal(configSchema.safeParse(config).success, false);
});

test("verify a deduplicated client echo against the original search argv", () => {
  const r = fixture();
  const words = ["venue", "entry", "VENUE"];
  r.config.operations[0].primary = [words];
  r.commands[1].argv = searchArgs(words, 2);
  r.commands[1].output.query.words = ["venue", "entry"];
  assert.equal(status(r), "DISCOVERED");
  r.commands[1].output.query.words.reverse();
  assert.equal(status(r), "CHECK_ERROR");
});

test("repeating a word cannot make a control query independent", () => {
  const config = fixture().config;
  config.operations[0].controls = [["venue", "VENUE"]];
  assert.equal(configSchema.safeParse(config).success, false);
});

test("metrics use primary verdicts and eligible rank cutoffs", () => {
  const score = (r) => summarize(evaluate(r)).overall;
  const perfect = score(fixture());
  assert.equal(perfect.hitRateAtK, 1);
  assert.equal(perfect.hitRateAt1, 1);
  assert.equal(perfect.mrrAtK, 1);
  assert.equal(perfect.hitRateAt3, null);
  for (const f of [fixture([], []), fixture([], [hit])]) {
    const m = score(f);
    assert.equal(m.evaluatedQueries, 1);
    assert.equal(m.hitRateAtK, 0);
    assert.equal(m.mrrAtK, 0);
    assert.equal(m.operationCoverage, 0);
  }
  const r = fixture();
  r.commands.splice(2, 1);
  assert.equal(score(r).provisional, false);
  assert.ok(evaluate(r).results[0].controls[0].error);
  r.commands.pop();
  const m = score(r);
  assert.equal(m.evidenceErrorQueries, 1);
  assert.equal(m.evaluatedQueries, 0);
  for (const k of ["hitRateAt1", "hitRateAtK", "mrrAtK", "operationCoverage"])
    assert.equal(m[k], null);
  assert.equal(
    checkPolicy(summarize(evaluate(r)), { thresholds: { minHitRateAtK: 0 } })
      .checks[0].verdict,
    "indeterminate",
  );
});
test("unequal query sets are weighted by valid queries; policy checks each operation", () => {
  const r = fixture([other, { ...hit, rank: 2 }]);
  const op = r.config.operations[0];
  op.primary.push(["hall"]);
  op.controls = [["control"]];
  r.commands.push({
    ...structuredClone(r.commands[2]),
    argv: searchArgs(["control"], 2),
    output: {
      ...r.commands[2].output,
      query: { words: ["control"], top: 2, dropped: [] },
    },
  });
  r.config.operations.push({
    ...op,
    id: "other",
    path: "/other",
    primary: [["venue"]],
  });
  const m = summarize(evaluate(r));
  assert.equal(m.overall.hitRateAtK, 1 / 3);
  assert.equal(m.overall.mrrAtK, 0.5 / 3);
  assert.equal(m.overall.operationCoverage, 0.5);
  assert.deepEqual(
    m.operations.map((x) => x.hitRateAtK),
    [0.5, 0],
  );
  const p = checkPolicy(m, {
    thresholds: {
      minHitRateAtK: 1 / 3,
      minMRRAtK: 0.5 / 3,
      minOperationHitRateAtK: 0.5,
    },
  });
  assert.equal(p.verdict, "fail");
  assert.deepEqual(
    p.checks.map((c) => c.verdict),
    ["pass", "pass", "pass", "fail"],
  );
});
test("reject invalid policies", () => {
  for (const thresholds of [
    {},
    { extra: 1 },
    { minMRRAtK: -1 },
    { minMRRAtK: 1.01 },
    { minMRRAtK: NaN },
    { minMRRAtK: Infinity },
    { minMRRAtK: "0" },
  ])
    assert.equal(
      policySchema.safeParse({ schemaVersion: 1, thresholds }).success,
      false,
    );
  for (const p of [
    { schemaVersion: 2, thresholds: { minMRRAtK: 1 } },
    { schemaVersion: 1, unknown: true, thresholds: { minMRRAtK: 1 } },
  ])
    assert.equal(policySchema.safeParse(p).success, false);
});

test("minimized evaluation datasets retain partial scores and evidence errors", () => {
  for (const [name, hits, mrr, coverage] of [
    ["agent402", 1, 0.1, 0.5],
    ["oblique", 3, 0.26, 1],
  ]) {
    const recording = JSON.parse(
      readFileSync(
        new URL(
          "../examples/recordings/" + name + "-evaluation.json",
          import.meta.url,
        ),
      ),
    );
    const report = evaluate(recording);
    const missingWord = name === "agent402" ? "for" : "by";
    const error = report.results.find(
      (result) => result.status === "CHECK_ERROR",
    );
    assert.equal(
      error.primary.error,
      "Dropped query words: " + JSON.stringify([missingWord]),
    );
    const summary = summarize(report);
    const m = summary.overall;
    assert.equal(m.provisional, true);
    assert.equal(m.totalQueries, 6);
    assert.equal(m.evaluatedQueries, 5);
    assert.equal(m.evidenceErrorQueries, 1);
    assert.equal(m.discoveredQueries, hits);
    assert.equal(m.hitRateAtK, hits / 5);
    assert.equal(m.mrrAtK, mrr);
    assert.equal(m.operationCoverage, coverage);
    assert.equal(
      checkPolicy(summary, { thresholds: { minOperationHitRateAtK: 0 } })
        .verdict,
      "indeterminate",
    );
  }
});
