# Container check fixtures

Used to prove `tools/clean-container-check.sh` works (blueprint step 44):

- `offline-ok` has no dependencies and must pass.
- `needs-network` downloads a package during its build and must fail.

Run both with the health path and port they serve, and expect pass then fail.
