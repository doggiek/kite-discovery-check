#!/usr/bin/env node
import {
  openSync,
  readFileSync,
  closeSync,
  fstatSync,
  writeFileSync,
  mkdtempSync,
  linkSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { capture } from "./capture.js";
import { compare, evaluate, exitCode, type Report } from "./evaluate.js";
import { configSchema, message } from "./model.js";

import { summarize } from "./metrics.js";
import { policySchema, checkPolicy } from "./policy.js";
import { metricLines, policyLines, deltaLine } from "./metric-report.js";

const usage =
  "kite-discovery-check capture CONFIG NEW_RECORDING [--json]\nkite-discovery-check replay RECORDING [--json]\nkite-discovery-check compare BASELINE CURRENT [--json]\nkite-discovery-check evaluate RECORDING [--policy POLICY] [--json]";
function read(path: string, limit: number) {
  const fd = openSync(path, "r");
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit)
      throw new Error(
        "Expected a regular input file within the size limit: " + path,
      );
    return JSON.parse(readFileSync(fd, "utf8"));
  } finally {
    closeSync(fd);
  }
}
function save(path: string, value: unknown) {
  const dir = mkdtempSync(join(dirname(path), ".kite-record-"));
  try {
    const temp = join(dir, "data");
    writeFileSync(temp, JSON.stringify(value) + "\n", { mode: 0o600 });
    linkSync(temp, path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function textReport(r: Report) {
  const lines = [
    r.at +
      " | ksearch " +
      (r.actualVersion ?? "unknown") +
      " (expected " +
      r.expectedVersion +
      ") | Top " +
      r.topK +
      " | " +
      r.kind,
  ];
  for (const v of r.results) {
    lines.push(
      v.status + " " + v.id + " " + v.method + " " + v.url,
      "  Fact: " + v.reason,
    );
    for (const [i, o] of [v.primary, ...v.controls].entries()) {
      const label = i === 0 ? "primary" : "control";
      lines.push(
        "  " +
          label +
          " " +
          JSON.stringify(o.query) +
          " | " +
          (o.error ??
            (o.hit ? "#" + o.hit.rank + " card " + o.hit.card : "no match")) +
          " | inspected " +
          (o.inspected ?? "unknown"),
        "    Evidence argv: " +
          o.refs.map((ref) => JSON.stringify(ref)).join(" / "),
      );
      if (!o.hit && o.firstReturned)
        lines.push(
          "    First returned: " +
            o.firstReturned.method +
            " " +
            o.firstReturned.host +
            o.firstReturned.path +
            " (card " +
            o.firstReturned.card +
            ")",
        );
    }
    lines.push("  Public-rule check: " + v.publicRuleCheck);
    if (v.needsConfirmation) lines.push("  Follow-up: " + v.needsConfirmation);
  }
  return lines.join("\n");
}
const args = process.argv.slice(2),
  json = args.at(-1) === "--json";
if (json) args.pop();
try {
  const [verb, first, second] = args;
  if (verb === "--help" && args.length === 1) {
    console.log(usage);
  } else if (
    verb === "evaluate" &&
    first &&
    (args.length === 2 ||
      (args.length === 4 && second === "--policy" && args[3]))
  ) {
    const report = evaluate(read(first, 32 * 1024 * 1024));
    const summary = summarize(report);
    const policy = args[3]
      ? checkPolicy(summary, policySchema.parse(read(args[3], 65536)))
      : null;
    const output = { ...report, ...summary, policy };
    console.log(
      json
        ? JSON.stringify(output)
        : [
            textReport(report),
            ...metricLines(summary),
            ...policyLines(policy),
          ].join("\n"),
    );
    process.exitCode = summary.overall.provisional
      ? 2
      : policy?.verdict === "fail"
        ? 1
        : 0;
  } else if (verb === "compare" && first && second && args.length === 3) {
    const diff = compare(
      read(first, 32 * 1024 * 1024),
      read(second, 32 * 1024 * 1024),
    );
    console.log(
      json
        ? JSON.stringify(diff)
        : [
            diff.reason,
            JSON.stringify(diff.before) + " → " + JSON.stringify(diff.after),
            "Baseline",
            ...metricLines(diff.metrics.baseline),
            "Current",
            ...metricLines(diff.metrics.current),
            deltaLine("Overall", diff.metrics.delta),
            ...diff.metrics.operations.map((op) => deltaLine(op.id, op.delta)),
            ...diff.changes.map(
              (c) =>
                c.id +
                " " +
                JSON.stringify(c.query) +
                " " +
                JSON.stringify(c.before) +
                " → " +
                JSON.stringify(c.after) +
                " " +
                c.trend,
            ),
          ].join("\n"),
    );
    process.exitCode =
      !diff.comparable || diff.changes.some((v) => v.trend === "indeterminate")
        ? 2
        : diff.changes.some((v) => v.trend === "regressed")
          ? 1
          : 0;
  } else {
    let data;
    if (verb === "capture" && first && second && args.length === 3) {
      data = capture(configSchema.parse(read(first, 65536)));
      save(second, data);
    } else if (verb === "replay" && first && args.length === 2) {
      data = read(first, 32 * 1024 * 1024);
    } else throw new Error(usage);
    const r = evaluate(data);
    console.log(json ? JSON.stringify(r) : textReport(r));
    process.exitCode = exitCode(r);
  }
} catch (e) {
  const error = message(e);
  console.error(
    json
      ? JSON.stringify({ status: "CHECK_ERROR", error })
      : "CHECK_ERROR " + error,
  );
  process.exitCode = 2;
}
