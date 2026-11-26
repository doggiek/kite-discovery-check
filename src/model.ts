import { z } from "zod";

export const key = (args: string[]) => JSON.stringify(args);
// ksearch echoes each lowercased argv token once, in first-occurrence order.
const queryKey = (words: string[]) =>
  key([...new Set(words.map((word) => word.toLowerCase()))]);
const unique = (values: string[]) => new Set(values).size === values.length;
const words = z
  .array(
    z
      .string()
      .min(1)
      .max(120)
      .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u)
      .refine((s) => s === s.trim()),
  )
  .min(1)
  .max(8);
const queries = z
  .array(words)
  .min(1)
  .max(8)
  .refine((v) => unique(v.map(queryKey)), "Duplicate query");
const origin = z
  .string()
  .max(300)
  .refine((s) => {
    try {
      const url = new URL(s);
      return url.protocol === "https:" && s === url.origin;
    } catch {
      return false;
    }
  }, "Use a canonical HTTPS origin without a trailing slash");
const path = z
  .string()
  .max(1024)
  .regex(/^\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]*$/)
  .refine(
    (s) => !s.split("/").some((p) => p === "." || p === ".."),
    "Expected static path",
  );
export const operationSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/),
    method: z.enum([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTIONS",
    ]),
    path,
    primary: queries,
    controls: queries,
  })
  .strict()
  .refine(
    (o) => unique([...o.primary, ...o.controls].map(queryKey)),
    "Primary and control queries must differ",
  );
export const configSchema = z
  .object({
    schemaVersion: z.literal(1),
    ksearchVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    topK: z.number().int().min(1).max(200),
    origin,
    operations: z.array(operationSchema).min(1).max(20),
  })
  .strict()
  .refine(
    (c) => unique(c.operations.map((o) => o.id)),
    "Duplicate operation ID",
  );
export type Config = z.infer<typeof configSchema>;
export type Operation = z.infer<typeof operationSchema>;
export const searchArgs = (query: string[], top: number) => [
  "service",
  "search",
  ...query,
  "--top",
  String(top),
  "--output",
  "json",
];
export const detailArgs = (id: string) => [
  "service",
  "search",
  "--example",
  id,
  "--output",
  "json",
];
const timestamp = z.string().datetime({ offset: true });
export const commandSchema = z.object({
  argv: z.array(z.string()).min(1).max(20),
  at: timestamp,
  exitCode: z.number().int().nullable(),
  error: z.string().optional(),
  output: z.unknown(),
});
export type Command = z.infer<typeof commandSchema>;
export const recordingSchema = z
  .object({
    format: z.literal(1),
    kind: z.enum(["capture", "minimized-observation", "synthetic"]),
    at: timestamp,
    config: configSchema,
    commands: z.array(commandSchema).max(4096),
  })
  .refine(
    (r) => unique(r.commands.map((c) => key(c.argv))),
    "Duplicate command evidence",
  );
export type Recording = z.infer<typeof recordingSchema>;
const id = z.string().regex(/^[a-f0-9]{24}$/);
const row = z.object({
  id,
  rank: z.number().int().positive(),
  host: z
    .string()
    .min(1)
    .max(300)
    .refine((host) => {
      try {
        return new URL("https://" + host).host === host;
      } catch {
        return false;
      }
    }, "Invalid catalog host"),
  method: z.string().regex(/^[A-Z]+$/),
  path: z
    .string()
    .max(4096)
    .regex(/^\/[^\s\x00-\x1f\x7f]*$/u),
});
export type Row = z.infer<typeof row>;
const page = z.object({
  query: z.object({
    words: z.array(z.string()),
    top: z.number().int(),
    dropped: z.array(z.string()),
  }),
  matched: z.number().int().nonnegative(),
  shown: z.number().int().nonnegative(),
  lines: z.array(row),
});
export const detail = z.object({
  id,
  host: row.shape.host,
  method: row.shape.method,
  path: row.shape.path,
  url: z.string(),
});

export function content(c: Command | undefined) {
  if (!c) throw new Error("Command evidence missing");
  if (c.error || c.exitCode !== 0)
    throw new Error(c.error || "Command exited " + c.exitCode);
  return c.output;
}
export function version(c: Command | undefined) {
  const text = content(c);
  const match =
    typeof text === "string" && /^ksearch (\d+\.\d+\.\d+)$/u.exec(text.trim());
  if (!match) throw new Error("Invalid ksearch version output");
  return match[1]!;
}
export function readRows(c: Command | undefined, q: string[], top: number) {
  const parsed = page.safeParse(content(c));
  if (!parsed.success) throw new Error("Incompatible search JSON");
  const p = parsed.data;
  if (
    key(p.query.words) !== queryKey(q) ||
    p.query.top !== top ||
    p.query.dropped.length
  )
    throw new Error("Query echo differs or words were dropped");
  if (
    p.shown !== Math.min(p.matched, top) ||
    p.lines.length !== p.shown ||
    !unique(p.lines.map((r) => r.id)) ||
    p.lines.some((r, i) => r.rank !== i + 1)
  )
    throw new Error("Incomplete or inconsistent ranked window");
  return p.lines;
}
export function candidate(r: Row, o: Operation, origin: string) {
  return (
    r.host === new URL(origin).host &&
    r.method === o.method &&
    r.path === o.path
  );
}
export const message = (err: unknown) =>
  err instanceof Error ? err.message : String(err);
