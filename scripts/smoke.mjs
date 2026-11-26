import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const dir = mkdtempSync(join(tmpdir(), "kite-package-"));
function run(bin, args, cwd, expected = 0) {
  const result = spawnSync(bin, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: join(dir, "cache"),
      npm_config_offline: "true",
      npm_config_loglevel: "error",
    },
  });
  assert.equal(
    result.status,
    expected,
    result.error?.message ?? result.stderr + result.stdout,
  );
  return result.stdout;
}
try {
  const [packed] = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", dir], process.cwd()),
  );
  assert.ok(packed.files.every((f) => !f.path.startsWith("local-recordings/")));
  const app = join(dir, "consumer");
  mkdirSync(app);
  writeFileSync(join(app, "package.json"), '{"private":true}');
  run(
    "npm",
    [
      "install",
      "--offline",
      "--no-audit",
      "--no-fund",
      "--ignore-scripts",
      join(dir, packed.filename),
    ],
    app,
  );
  const bin = join(app, "node_modules/.bin/kite-discovery-check");
  run(bin, ["--help"], app);
  const fixture =
    "node_modules/kite-discovery-check/examples/recordings/oblique.json";
  const report = JSON.parse(run(bin, ["replay", fixture, "--json"], app, 1));
  assert.deepEqual(
    report.results.map((v) => v.status),
    ["DISCOVERED", "QUERY_MISS"],
  );
  assert.equal(
    JSON.parse(run(bin, ["compare", fixture, fixture, "--json"], app))
      .comparable,
    true,
  );
  const evaluation = JSON.parse(run(bin, ["evaluate", fixture, "--json"], app));
  assert.equal(evaluation.overall.hitRateAtK, 0.5);
  const policy =
    "node_modules/kite-discovery-check/examples/evaluation/policy.json";
  run(bin, ["evaluate", fixture, "--policy", policy], app, 1);
  run(
    bin,
    ["evaluate", fixture.replace("oblique.json", "oblique-evaluation.json")],
    app,
    2,
  );
  console.log(
    "Packed CLI installed with an empty offline npm cache; help, replay, evaluate and compare passed.",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
