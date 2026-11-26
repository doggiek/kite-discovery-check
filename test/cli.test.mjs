import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const example = fileURLToPath(
  new URL("../examples/recordings/oblique.json", import.meta.url),
);
const config = fileURLToPath(
  new URL("../examples/oblique.json", import.meta.url),
);
function workspace(t) {
  const d = mkdtempSync(join(tmpdir(), "kite-test-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}
function run(args, env = {}, pre = []) {
  return spawnSync(process.execPath, [...pre, cli, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}
test("replay without network or child process", (t) => {
  const d = workspace(t),
    guard = join(d, "offline.cjs");
  writeFileSync(
    guard,
    `const deny=()=>{throw Error('unexpected external IO')};global.fetch=deny;require('node:net').Socket.prototype.connect=deny;require('node:dns').lookup=deny;for(const k of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])require('node:child_process')[k]=deny;require('node:module').syncBuiltinESMExports();`,
  );
  const res = run(["replay", example, "--json"], { PATH: d }, [
    "--require",
    guard,
  ]);
  const evaluation = run(["evaluate", example, "--json"], { PATH: d }, [
    "--require",
    guard,
  ]);
  assert.equal(evaluation.status, 0, evaluation.stderr);
  assert.equal(JSON.parse(evaluation.stdout).overall.hitRateAtK, 0.5);
  assert.equal(res.status, 1, res.stderr);
  assert.equal(JSON.parse(res.stdout).results[0].status, "DISCOVERED");
});
test("invalid file emits machine-readable diagnostic", (t) => {
  const f = join(workspace(t), "bad");
  writeFileSync(f, "{");
  const r = run(["replay", f, "--json"]);
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stderr).status, "CHECK_ERROR");
});
test("capture, replay, compare and exclusive baseline", (t) => {
  const d = workspace(t),
    bin = join(d, "ksearch"),
    out = join(d, "baseline.json");
  const archive = JSON.parse(readFileSync(example));
  writeFileSync(join(d, "commands.json"), JSON.stringify(archive.commands));
  writeFileSync(
    bin,
    "#!" +
      process.execPath +
      '\nconst cs=require("./commands.json");const a=process.argv.slice(2);const c=cs.find(x=>JSON.stringify(x.argv)===JSON.stringify(a));if(!c)process.exit(9);console.log(typeof c.output==="string"?c.output:JSON.stringify(c.output));',
  );
  chmodSync(bin, 0o755);
  const env = { PATH: d + delimiter + process.env.PATH };
  const live = run(["capture", config, out, "--json"], env);
  assert.equal(live.status, 1, live.stderr);
  const orig = readFileSync(out);
  assert.deepEqual(
    JSON.parse(live.stdout),
    JSON.parse(run(["replay", out, "--json"]).stdout),
  );
  assert.equal(run(["compare", example, out, "--json"]).status, 0);
  assert.equal(run(["capture", config, out, "--json"], env).status, 2);
  assert.deepEqual(readFileSync(out), orig);
});
for (const mode of [
  "missing",
  "nonzero",
  "invalid",
  "oversize",
  "timeout",
  "wrong-version",
]) {
  test("capture survives " + mode, (t) => {
    const d = workspace(t),
      out = join(d, "rec"),
      bin = join(d, "ksearch");
    if (mode !== "missing") {
      const use = {
        nonzero: "process.exit(9)",
        invalid: 'console.log("{")',
        oversize: 'console.log("x".repeat(600000))',
        timeout: "setInterval(()=>{},1000)",
        "wrong-version": "process.exit(99)",
      };
      writeFileSync(
        bin,
        "#!" +
          process.execPath +
          "\nif(process.argv[2]==='--version')console.log('ksearch " +
          (mode === "wrong-version" ? "0.0.0" : "6.13.9") +
          "');else " +
          use[mode],
      );
      chmodSync(bin, 0o755);
    }
    const c = JSON.parse(readFileSync(config));
    c.operations = c.operations.slice(0, 1);
    c.operations[0].controls = [["probe"]];
    const f = join(d, "config");
    writeFileSync(f, JSON.stringify(c));
    const r = run(["capture", f, out, "--json"], { PATH: d });
    assert.equal(r.status, 2, r.stderr);
    assert.equal(JSON.parse(r.stdout).results[0].status, "CHECK_ERROR");
    assert.equal(run(["replay", out]).status, 2);
  });
}

test("evaluate policy exit codes and additive compare with offsetting rank changes", (t) => {
  const d = workspace(t),
    f = join(d, "policy.json");
  const policy = (thresholds) =>
    writeFileSync(f, JSON.stringify({ schemaVersion: 1, thresholds }));
  policy({ minHitRateAtK: 0.5 });
  assert.equal(run(["evaluate", example, "--policy", f]).status, 0);
  policy({ minOperationHitRateAtK: 0.1 });
  assert.equal(run(["evaluate", example, "--policy", f]).status, 1);
  policy({});
  assert.equal(run(["evaluate", example, "--policy", f]).status, 2);
  const read = () => JSON.parse(readFileSync(example));
  const a = read(),
    b = read();
  a.kind = b.kind = "synthetic";
  function promote(r, i, rank) {
    const op = r.config.operations[i];
    const detail = r.commands.find(
      (c) => c.output?.url === r.config.origin + op.path,
    ).output;
    const page = r.commands.find(
      (c) =>
        JSON.stringify(c.argv.slice(2, -4)) === JSON.stringify(op.primary[0]),
    ).output;
    const row = {
      rank,
      id: detail.id,
      path: detail.path,
      host: detail.host,
      method: detail.method,
    };
    page.lines = page.lines.filter((x) => x.id !== row.id);
    page.lines.splice(rank - 1, 0, row);
    page.lines = page.lines.slice(0, r.config.topK);
    page.lines.forEach((x, j) => (x.rank = j + 1));
    page.shown = page.lines.length;
    page.matched = Math.max(page.matched, page.shown);
  }
  promote(b, 0, 2);
  promote(b, 1, 1);
  const left = join(d, "a"),
    right = join(d, "b");
  writeFileSync(left, JSON.stringify(a));
  writeFileSync(right, JSON.stringify(b));
  const cmp = (l, r) => run(["compare", l, r, "--json"]);
  const result = cmp(left, right);
  assert.equal(result.status, 1);
  const diff = JSON.parse(result.stdout);
  assert.equal(diff.metrics.delta.hitRateAtK, 0.5);
  assert.equal(diff.metrics.delta.mrrAtK, 0.25);
  assert.equal(diff.metrics.current.overall.hitRateAt3, 1);
  assert.deepEqual(
    diff.changes.map((c) => c.trend),
    ["regressed", "improved"],
  );
  assert.equal(
    JSON.parse(cmp(right, left).stdout).metrics.delta.hitRateAtK,
    -0.5,
  );
  b.commands = b.commands.filter((c) => c.argv[0] !== "--version");
  writeFileSync(right, JSON.stringify(b));
  assert.equal(cmp(left, right).status, 2);
  assert.equal(JSON.parse(cmp(left, right).stdout).metrics.delta, null);
  b.config.topK = 9;
  writeFileSync(right, JSON.stringify(b));
  assert.equal(JSON.parse(cmp(left, right).stdout).comparable, false);
});
