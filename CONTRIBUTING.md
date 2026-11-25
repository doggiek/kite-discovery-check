# Contributing

Choose one reproducible merchant-discovery issue. Include the ksearch version, public task words, window and expected method/path. Provide a minimized recording or synthetic fixture and mark its origin. Strip credentials, account details, response examples and merchant content that is unnecessary for the test.

Make changes and run the [local checks](docs/testing.md). A correctness fix should fail a focused test first. Preserve the distinction between search misses and missing evidence. Changes to recording or input compatibility need explicit version handling, documentation and replay tests with prior recordings. Keep CI offline after dependency installation.

Human contributors review and take responsibility for submitted code and evidence. Discuss public contract changes first. Contributions to the original project are offered under Apache-2.0; identify any third-party code and its license.
