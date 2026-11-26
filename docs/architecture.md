# Architecture

The CLI loads a versioned JSON configuration, captures the selected official client's observations, and passes that recording to the same evaluator used by replay. Compare evaluates each recording against its own expected client version before comparing results.

| Module          | Responsibility                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| src/model.ts    | Validate configurations and recording envelopes, construct allowed argv, verify version and ranked-window completeness.                                                                |
| src/capture.ts  | Invoke ksearch with argument arrays and shell disabled. De-duplicate identical queries and candidate card lookups within a run. Preserve successful JSON payloads and explicit errors. |
| src/evaluate.ts | Derive primary and control evidence, acceptance verdicts and comparable baseline changes. No process, filesystem or network dependency.                                                |
| src/cli.ts      | Bound input file sizes, format terminal or JSON output, map exit codes. Publish each complete capture via an exclusive hard link from a temporary file on the same filesystem.         |

## Evidence requirements

Only a row with the expected host (including any non-default port), method and exact path can trigger a paid-operation **metadata** lookup. Detail lookup uses the public card ID and confirms ID, host, method, path and the full HTTPS URL. Matching preserves path case and trailing slash. Where a detail is already recorded under a row's ID, contradictory evidence for the target raises an error.

For each primary, a verified hit suffices. On a primary miss a verified control hit suffices to establish QUERY_MISS. Otherwise every necessary control must complete for NOT_OBSERVED. A primary evidence error always yields CHECK_ERROR. A failed auxiliary control remains visible even when another observation is decisive. A competent-looking first row is retained as context only.

Completeness checks cover query echo, dropped words, window size, matched/shown counts, contiguous ranks and duplicate IDs. Receipts are observations from a particular invocation; they provide no authenticity or independently signed catalog version. The consumer can inspect argv references and the original JSON. An unrecognized response shape fails closed.

## Compare

Identity includes origin, operation IDs, method/path, ordered word arrays, primary/control groups and K. Operation declaration order does not change identity. Any incompatible setting rejects the comparison as a whole. The expected client version may differ. An exact primary rank gain/loss and entry/exit from primary visibility are directional changes. Transitions between two kinds of miss are reported as a control-visibility change. An evidence error on either side is indeterminate. Capture never updates a baseline in place.

## Evaluation layer

Capture, replay and offline evaluate share the per-primary evaluator. metrics.ts groups its verdicts by operation and calculates overall metrics directly over all primaries. policy.ts validates a separate versioned JSON document and evaluates inclusive thresholds. Both modules are pure. cli.ts handles file IO and exit codes; metric-report.ts formats numbers for terminal output. Compare reuses both evaluated reports for summaries and joins operation differences by ID.
