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
