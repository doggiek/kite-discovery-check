# Kite Discovery Check

Merchant-side discovery acceptance and regression testing for Kite Passport. Configure the operations a seller expects buyers to find, measure their positions with a particular `ksearch` client, and retain the evidence for offline review. [中文说明](README.zh-CN.md)

## Background

During a Passport CLI and Skills experiment on 25 November 2026, Agent402 Tools' public OpenAPI described both Market Pulse and Demand Radar. With ksearch 6.13.9, the **provider-qualified** query `agent402.tools market pulse` returned the expected GET route first. Demand Radar was absent from the 103 rows returned by a separate domain-only search at K=200. The included regression uses a smaller, explicit K=10 for both the provider-qualified phrases and the domain control. The two windows are distinct. [Agent402 OpenAPI](https://agent402.tools/openapi.json) · [Demand Radar documentation](https://agent402.tools/tools/demand-radar) · [Recording provenance](examples/README.md)

At Oblique Markets, searching the **interface name** `bazaar-category-heat` found the GET operation second, behind a related POST feed. A **buyer task query** of `category payment activity` missed the GET route in the first ten. Another buyer query, `market price percentiles`, returned Bazaar Market Report first. The same **domain-only control** missed both targets in the first ten. These observations came from publicly described operations selected for this experiment. Neither merchant's endorsement or listing intent was established. [Oblique Markets OpenAPI](https://api.oblique.markets/openapi.json) · [Observed fixtures](examples/README.md)

## Problem and scope

A matching merchant name or a similar path can identify the wrong operation. This CLI checks an explicit HTTPS origin, method and static path, joins a ranked row to its card detail, and records the window examined. A miss describes that query and window. Catalog admission, payment availability and ranking causes require other evidence.

The evaluation loop is **Define → Measure → Diagnose → Improve → Compare**. Define primary and control queries, capture the official client's results, inspect the reason for each verdict, make any justified change yourself, then compare equivalent baselines. v0.1.0 includes no catalog write or merchant call.

## Use cases

- **Service release acceptance** checks a seller-selected operation against its expected buyer query.
- **Discovery regression testing** compares a saved baseline with a later capture using the same configuration.
- **Query evaluation** shows which primary and control terms located the verified card.
- **Reproducible diagnostics** let a maintainer inspect the same ranked window offline.

| Verdict      | Required evidence                                                     |
| ------------ | --------------------------------------------------------------------- |
| DISCOVERED   | Primary window contains the exact operation and the card agrees.      |
| QUERY_MISS   | Primary misses and a control verifies the operation.                  |
| NOT_OBSERVED | All necessary windows are complete and none verifies the operation.   |
| CHECK_ERROR  | Evidence needed for the decision is missing, failed or contradictory. |

**Synthetic comparison example.** The test below uses an invented venue service. Moving the verified operation from rank 1 to 2 produces `regressed`; reversing those recordings produces `improved`.

```sh
npm run build
node --test --test-name-pattern="comparison observes visibility" test/evaluate.test.mjs
```

## Quick start

From the source checkout, use Node.js 22+ and npm. Replay uses the included recordings and needs no Passport installation or account.

```sh
npm ci
npm run build
node dist/cli.js replay examples/recordings/oblique.json
node dist/cli.js compare examples/recordings/oblique.json examples/recordings/oblique.json --json
```

The first example exits **1**, the expected acceptance failure; the unchanged comparison exits **0**. To record a new baseline, put the specified official ksearch on PATH and supply a new destination in an existing directory.

```sh
mkdir -p local-recordings
node dist/cli.js capture examples/oblique.json local-recordings/oblique-run-1.json
```

## Example

| Operation                    | Primary query               | ksearch 6.13.9, Top 10       |
| ---------------------------- | --------------------------- | ---------------------------- |
| Agent402 Market Pulse        | agent402.tools market pulse | DISCOVERED · #1              |
| Agent402 Demand Radar        | agent402.tools demand radar | NOT_OBSERVED                 |
| Oblique Bazaar Market Report | market price percentiles    | DISCOVERED · #1              |
| Oblique Bazaar Category Heat | category payment activity   | QUERY_MISS · name control #2 |

`CHECK_ERROR` identifies missing or contradictory evidence. ksearch counts each word or phrase token once, ignoring case. Repeating a token cannot distinguish a control from its primary query. Each result includes the actual query, card ID for a verified hit, reason, inspected rows and references into the recording.

## Kite integration

Capture invokes three public CLI forms: `ksearch --version`, `ksearch service search WORDS --top K --output json`, and `ksearch service search --example ID --output json`. The installed client's embedded endpoint catalog supplies the measured ranks. The service backend's Provider records and Passport Agent Directory are separate discovery surfaces. See [architecture](docs/architecture.md) and the [official Passport Skills](https://github.com/gokite-ai/passport-skills).

## Related work and limitations

x402 Data Gateway already audits merchant routes and brand-blind intent ranking across discovery sources, and includes CDP replay tooling. Tanod offers listing lint and Bazaar coverage reports. This project tests a pinned Passport client using ranked rows, card details and control queries. [Gateway implementation](https://github.com/epistemedeus/x402-url-extractor/blob/259004f677d868903736fa4a882bec98cf23d80d/agent-discoverability-audit.mjs) · [Tanod listing lint](https://tanod.dev/learn/x402-listing-lint-api.html)

The v1 recording reader supports the observed 6.13.9 output shape, static paths and ranked keyword queries. A client version does not pin the underlying catalog independently or authenticate a recording. A ranking change can reflect catalog content, the client or both. The project does not infer a ranking algorithm or guarantee better placement. [CLI and exit codes](docs/cli-reference.md) · [Testing and local installation](docs/testing.md) · [Roadmap](docs/roadmap.md)

Apache-2.0 was chosen for the original implementation to provide explicit reuse and patent terms. Third-party data and dependencies retain their own rights. [License](LICENSE) · [Fixture handling](examples/README.md)
