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
