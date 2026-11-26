# Test, build and install

Use Node.js 22+ and npm from the repository root. CI checks on Ubuntu with Node 22. On a clean checkout:

```sh
npm ci
npm audit --audit-level=high
npm run format:check
npm run typecheck
npm test
npm run build
npm run smoke
```

npm test builds TypeScript and uses Node's built-in test runner. Unit tests cover exact identity and rank, evidence errors, independent primary judgments, real observations and synthetic comparisons. CLI tests use an isolated fake ksearch to exercise subprocess errors and deadlines. Offline replay tests remove ksearch from PATH and install fail-fast guards for child processes, fetch and socket connections. CI never contacts a merchant or Passport. Dependency installation and the separate full-lockfile npm advisory check use the npm registry. The CI job has a ten-minute timeout.

The smoke script packs the built project into a temporary directory, installs the tarball in a separate empty consumer with an empty npm cache in offline mode, and runs the installed executable's help, replay and compare. Its runtime validator is bundled. Temporary files are removed after the test. No deployment service is required. For a local distributable after review, use npm pack; publication requires separate approval.

For a new client version, make a separate config with the new expected version and retain the old recording. Inspect CHECK_ERROR first (version, command status, JSON shape, missing detail), then look at each query's first returned card and controls. Link a reproducible window and card to any issue; withhold raw captures containing unreviewed third-party data.

Evaluation tests use synthetic fixtures to check denominators, rank cutoffs, unequal operation sizes, evidence errors, policy boundaries and offsetting changes across queries. CLI tests exercise the offline guard for evaluate. The installed-package smoke also runs evaluate with and without a policy and exercises an incomplete multi-query sample. Capture command examples and expected observations are in the [evaluation notes](development-notes/week-02-discovery-evaluation.md).
