import { spawnSync } from "node:child_process";
import {
  candidate,
  configSchema,
  detailArgs,
  key,
  readRows,
  searchArgs,
  type Command,
  type Config,
  type Recording,
} from "./model.js";

export function capture(input: Config): Recording {
  const config = configSchema.parse(input);
  const commands = new Map<string, Command>();
  const at = new Date().toISOString();
  let remaining = 12 * 1024 * 1024;
  const deadline = Date.now() + 120_000;
  function run(argv: string[]) {
    const stored = commands.get(key(argv));
    if (stored) return stored;
    if (commands.size >= 4095)
      throw new Error("Capture command limit exceeded");
    const c: Command = {
      argv,
      at: new Date().toISOString(),
      exitCode: null,
      output: null,
    };
    commands.set(key(argv), c);
    if (remaining <= 0 || Date.now() >= deadline) {
      c.error = "Capture resource limit";
      return c;
    }
    const proc = spawnSync("ksearch", argv, {
      shell: false,
      encoding: "utf8",
      timeout: Math.max(1, Math.min(5000, deadline - Date.now())),
      killSignal: "SIGKILL",
      maxBuffer: 512 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    c.exitCode = proc.status;
    if (proc.error || proc.status !== 0) {
      c.error = proc.error
        ? (proc.error as NodeJS.ErrnoException).code || "Spawn failed"
        : "ksearch failed (exit " + proc.status + ")";
      return c;
    }
    remaining -= Buffer.byteLength(proc.stdout);
    if (remaining < 0) {
      c.error = "Capture byte budget exceeded";
      return c;
    }
    try {
      c.output =
        argv[0] === "--version" ? proc.stdout.trim() : JSON.parse(proc.stdout);
    } catch {
      c.error = "Invalid JSON on stdout";
    }
    return c;
  }
  const recording: Recording = {
    format: 1,
    kind: "capture",
    at,
    config,
    commands: [],
  };
  const v = run(["--version"]);
  if (v.exitCode === 0 && v.output === "ksearch " + config.ksearchVersion) {
    for (const op of config.operations) {
      for (const query of [...op.primary, ...op.controls]) {
        const page = run(searchArgs(query, config.topK));
        // Preserve the original response on schema failure; replay diagnoses it.
        let rows;
        try {
          rows = readRows(page, query, config.topK);
        } catch {
          continue;
        }
        for (const r of rows)
          if (candidate(r, op, config.origin)) run(detailArgs(r.id));
      }
    }
  }
  recording.commands = [...commands.values()];
  return recording;
}
