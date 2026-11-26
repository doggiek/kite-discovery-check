# Discovery evaluation

## Background and scope

A merchant can define several buyer tasks for each operation. Evaluate measures the configured set on one recorded client and window. Controls help establish the per-primary verdict. Only primary verdicts enter scores.

## Technical decisions

| Field                              | Definition                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| totalQueries                       | Number of primary verdicts, including errors.                                                                               |
| evaluatedQueries                   | DISCOVERED + QUERY_MISS + NOT_OBSERVED.                                                                                     |
| evidenceErrorQueries               | Number of CHECK_ERROR verdicts.                                                                                             |
| discoveredQueries, statusCounts    | Verified primary hits and counts for each of the four verdicts.                                                             |
| hitRateAtK, hitRateAt1, hitRateAt3 | Verified primary hits at or above the requested position divided by evaluatedQueries. At 3 is null when K < 3.              |
| mrrAtK                             | Sum of 1 / best verified primary rank divided by evaluatedQueries. Both kinds of valid miss contribute zero.                |
| operationCoverage                  | Operations with at least one verified primary hit divided by all configured operations. Within an operation this is 0 or 1. |

Each operation has at least one configured primary. Overall rates weight each evaluated query equally. Coverage weights operations equally. Any primary error makes its operation and the overall result provisional. A decisive primary may have auxiliary control errors; the per-query report retains them. With zero valid judgments, all rate, MRR and coverage fields for that group are null. Counts remain available.

## Policy and comparison

Policy schemaVersion 1 requires one or more of minHitRateAtK, minMRRAtK and minOperationHitRateAtK inside thresholds. Each finite number must lie in [0, 1]. Unknown fields are rejected. Compare full-precision values with inclusive minima. The per-operation threshold produces a check for every operation. An incomplete evaluation makes all policy verdicts indeterminate. Policies are optional.

Compare requires the existing identical ordered query groups, windows and targets. Each side retains its summaries even when incomparable. Overall deltas require two complete comparable summaries; a per-operation delta requires complete evidence for that operation on both sides. JSON retains numeric precision. A rank loss on one query can still fail compare when overall hit rate increases.

## Limitations

These descriptive metrics depend on the chosen task expressions. They do not estimate marketplace traffic or identify causes of ranking changes. A narrow window cannot establish performance outside that window.
