# Discovery acceptance

## Background and scope

Two merchant experiments showed that task and control queries can find different operations. The initial delivery targeted repeatable seller acceptance in the embedded Passport catalog.

## Technical decisions and changes

The CLI records bounded read-only commands and verifies each hit against its card. Offline replay checks the exact origin, method and static path. Compare retains per-primary rank changes. The initial review covered contradictory ranks and case-equivalent controls. The November 26 maintenance fix recognizes repeated tokens in the deduplicated ksearch echo and rejects equivalent controls.

## Validation

The initial main commit passed 35 tests and the Ubuntu installed-package smoke. The repeated-token patch passed 37 tests locally and reproduced rank 1 with a read-only Oblique capture. The initial release was pushed directly to main. The maintenance patch was squash-merged after PR and main checks passed. [Maintenance PR #1](https://github.com/doggiek/kite-discovery-check/pull/1) · [Merged commit](https://github.com/doggiek/kite-discovery-check/commit/20d42e74d27b6aee2212c593600ccb4ea274029f) · [Main CI](https://github.com/doggiek/kite-discovery-check/actions/runs/45766343225). [Initial commit](https://github.com/doggiek/kite-discovery-check/commit/a1274114790ccfaaeddf38b299304350cd0c2322) · [Initial CI](https://github.com/doggiek/kite-discovery-check/actions/runs/45565031379)

## Limitations and next steps

A recorded window measures a specific query set and client. The next phase aggregates independent primary judgments across operations.
