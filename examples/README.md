# Observation provenance

Both bundled recordings are **minimized observations**. They retain ordered ranks, opaque card IDs, host, method, path, detail URL, inspected counts, query echo, command arguments and time. Promotional text, prices, historical responses, example bodies and scoring payloads were omitted. No blanket redistribution permission for the raw catalog was established in the installed discovery guide or command reference. The Skills repository's software license does not establish rights to merchant data. Unabridged captures belong in the ignored local-recordings directory. The fixtures are factual extracts, not a licensed catalog mirror or signed receipts. Synthetic error cases are generated separately in test/evaluate.test.mjs.

| Recording                | Origin of evidence                                                                                                                                                                                                 | Query interpretation                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| recordings/oblique.json  | Extracted from the original 2026-11-25 12:06:53–54 +08:00 search and detail JSON and timestamped command log. The version line used the start of that batch as its timestamp. Rechecked with the MVP capture path. | Domain control: api.oblique.markets. Name controls: bazaar-market-report and bazaar-category-heat. Unbranded primary terms are stored as separate argv words. |
| recordings/agent402.json | Fresh MVP capture at the timestamp inside the file, reproducing the earlier Market Pulse and Demand Radar observations.                                                                                            | Both primaries include the merchant domain plus task terms. The domain-only control here has K=10. The earlier K=200 domain experiment is background only.    |

The merchant sources are the [Agent402 OpenAPI](https://agent402.tools/openapi.json) and [Oblique OpenAPI](https://api.oblique.markets/openapi.json). Query commands for every row and card are in each recording's commands array. To reproduce from the project root with ksearch 6.13.9:

```sh
mkdir -p local-recordings
node dist/cli.js capture examples/oblique.json local-recordings/oblique-new.json
node dist/cli.js capture examples/agent402.json local-recordings/agent402-new.json
```

Each sample contains a planned miss and normally exits 1. These observations verify visibility on the measured client only. Original research artifacts remain outside the distributable package.
