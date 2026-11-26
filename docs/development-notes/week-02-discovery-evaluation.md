# Discovery evaluation

## Background and scope

Design and initial implementation took place on November 26, 2026. Final review took place on November 27. Per-query acceptance identifies a particular failure. This iteration measures how often a merchant's configured tasks find the intended operations and at which ranks.

## Technical decisions and changes

Aggregate verified primary verdicts, preserve controls for diagnosis, and apply optional inclusive policy thresholds. Compare retains individual regressions even when overall metrics improve. Both merchants have three buyer-task expressions per operation. Merchant domains and operation names serve as controls.

## Validation

Local verification passed on Node 22.12.0: 42 tests, format, typecheck, build and dependency audit (zero advisories). An empty-cache consumer installed the tarball offline and ran help, replay, evaluate, policy evaluation and compare.

## Real merchant observations

The following are read-only ksearch 6.13.9 observations at K=10 on November 26, 2026. Agent402 capture started at 05:59:42 UTC and Oblique at 05:59:45 UTC. Each slash-separated result below corresponds to the query in the same position.

| Operation     | Ordered buyer queries                                                                  | Actual verdicts                           |
| ------------- | -------------------------------------------------------------------------------------- | ----------------------------------------- |
| Market Pulse  | x402 market activity / paid service market trends / market transaction volume          | #2 / QUERY_MISS / QUERY_MISS              |
| Demand Radar  | unmet demand for services / missing paid endpoints / buyer demand signals              | CHECK_ERROR / NOT_OBSERVED / NOT_OBSERVED |
| Market Report | market price percentiles / compare service prices / paid endpoint pricing distribution | #1 / QUERY_MISS / #10                     |
| Category Heat | category payment activity / payments by service category / most active categories      | QUERY_MISS / CHECK_ERROR / #5             |

| Merchant | Valid / total | Hit@1 / Hit@3 / Hit@10 | MRR@10 | Covered operations |
| -------- | ------------- | ---------------------- | ------ | ------------------ |
| Agent402 | 5 / 6         | 0% / 20% / 20%         | 0.10   | 1 / 2              |
| Oblique  | 5 / 6         | 20% / 20% / 60%        | 0.26   | 2 / 2              |

Both summaries are provisional. ksearch dropped “for” and “by”, respectively. The queries and errors were retained. Reproduce offline with `node dist/cli.js evaluate examples/recordings/agent402-evaluation.json --json` or the corresponding oblique-evaluation.json. Both exit 2. To collect new evidence, run capture with the corresponding examples/evaluation configuration and a fresh local output path.

On November 27 (Asia/Shanghai), fresh captures of both unchanged configurations reproduced all ten valid primary verdicts and ranks and both evidence errors. Offline replay matched each capture. Each same-configuration comparison therefore retained five unchanged trends and one indeterminate trend, with no overall delta.

## Dropped words decision

Retain strict acceptance and report the exact dropped words in the observation error. On November 27, mixed queries containing “for” and “by” echoed the same remaining words and returned the same first two cards as the corresponding shorter queries. The client kept both tokens when given only “for by”. An unknown token remained in the echo even with zero matches. These observations do not establish a complete filter contract for ksearch 6.13.9 or other versions. Treating dropped tokens as interchangeable could also allow effectively identical primary and control queries.

Inspect the original argv and recorded query echo. If a shorter phrase also represents the buyer task, capture it as a new configuration with independent controls and its own baseline. Keep the original error as evidence.

## Historical comparison and limitations

On November 25 the merchant-qualified Agent402 primary for Market Pulse ranked first and Demand Radar was unobserved. On November 26 those expressions are controls. The two shared Oblique buyer expressions still give #1 and QUERY_MISS. A different Category Heat task now hits at #5. The query sets differ, so a historical-to-current aggregate delta is unavailable. Small task sets support fixture-level conclusions only.

## Next steps

Future diagnostics can investigate query equivalence if versioned client rules become available.
