# Local environment

Recorded for blueprint step 9 on 2026-09-29. Update if the machine or versions change.

| Component | Version |
|-----------|---------|
| OS | Windows 11 Pro (Docker engine runs linux/amd64) |
| Docker client / engine | 29.2.0 / 29.2.0 |
| BAND CLI / daemon | 0.4.12 |
| band-peer plugin (Claude Code) | 0.5.33 |
| Claude Code | 2.1.17 |
| Python | 3.14.2 |
| Node | 24.15.0 |

## Offline check

`docker run --rm --network none alpine echo ok` printed `ok`.

## Clean container check proof (step 44)

`tools/clean-container-check.sh` against its fixtures:

- `tools/tests/container/offline-ok`: **PASS** — built with no network, health answered `ok`, outbound blocked.
- `tools/tests/container/needs-network`: **FAIL as expected** — the build step that downloads a package cannot reach the index.

Logs: `tools/tests/container/*/evidence/container-check.log`.
