# CLI reference

| Command                                                      | Action                                                                                                                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kite-discovery-check capture CONFIG NEW_RECORDING [--json]` | Validate the config, check the version, collect search/detail evidence, save once and print acceptance. Destination parent must exist on a filesystem supporting hard links. Existing files are never replaced. |
| `kite-discovery-check replay RECORDING [--json]`             | Re-evaluate an entire recording offline.                                                                                                                                                                        |
| `kite-discovery-check compare BASELINE CURRENT [--json]`     | Compare all primary queries. Both arguments are read-only.                                                                                                                                                      |
| `kite-discovery-check --help`                                | Show usage.                                                                                                                                                                                                     |

For a source checkout, replace the executable with `node dist/cli.js`. Add --json last. Reports go to stdout. Invalid input envelopes, unreadable paths and usage errors emit a top-level diagnostic on stderr (JSON when requested). An invalid config cannot produce operation verdicts. Ordinary capture errors are retained in the recording where available.

## Configuration v1

Use [the Oblique example](../examples/oblique.json). All fields are required. Unknown configuration keys are rejected.

| Key                           | Contract                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| schemaVersion, ksearchVersion | Integer 1 and exact three-part CLI version, e.g. 6.13.9. Version mismatch stops discovery.                                                                                                                                                                                                                    |
| topK, origin                  | Integer 1–200 and canonical HTTPS origin with no credentials, path, query or trailing slash. One merchant per recording.                                                                                                                                                                                      |
| operations                    | 1–20 entries; IDs unique within a config.                                                                                                                                                                                                                                                                     |
| id, method, path              | Short stable identifier; uppercase GET, POST, PUT, PATCH, DELETE, HEAD or OPTIONS; full static ASCII path. Optional trailing slash is significant. Percent encodings, dot segments, parameters and query strings are outside v1.                                                                              |
| primary, controls             | Each is a list of 1–8 distinct queries (compared after lowercasing tokens and keeping their first occurrence). Each query is an array of 1–8 words/phrases (argv tokens). `["market","pulse"]` differs from `["market pulse"]`. Use public task words. Option-like tokens and shell punctuation are rejected. |

Only version, search and card detail commands are issued. Each child has up to five seconds and 512 KiB per output stream; a capture has a two-minute deadline and 12 MiB successful stdout budget. Input config is limited to 64 KiB and replay input to 32 MiB. Child stderr is not persisted. Use a trusted installed ksearch on PATH. For capture, consider the merchant-provided data in successful responses before sharing the resulting file.

## Results and exit codes

Every primary result has a status, reason, expected URL/method and primary/control observations. Each observation references the command by exact argv; a hit includes rank, card, URL and method. Machine output includes actual/expected version, timestamp, K and recording kind. Follow-up suggestions are separate from observed facts.

| Code | Capture / replay                                        | Compare                                                             |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| 0    | All primaries DISCOVERED                                | Comparable; no primary regression or evidence error                 |
| 1    | At least one QUERY_MISS or NOT_OBSERVED, no CHECK_ERROR | Primary visibility or rank regressed                                |
| 2    | CHECK_ERROR, malformed input, resource or file error    | Incompatible configuration, indeterminate evidence or invalid input |

An unchanged pair of missing results can pass the regression comparison while each run still fails absolute acceptance. Apply replay for an absolute gate. No tolerance band or weighted score is applied.
