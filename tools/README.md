# Tools

Generic checks the seats use. None of them knows anything about a particular task; the task supplies
paths, ports, templates and loads.

| Tool | One line |
|------|----------|
| `lint-mandates.sh` | Fails if mandates, protocols or tool docs contain track-specific terms or code identifiers |
| `banned-terms.txt` | The terms the lint forbids, extended from the spec at intake |
| `clean-container-check.sh` | Builds and runs a stage with no network and resource caps, then probes its health check |
| `offline-deps.md` | How to vendor dependencies per ecosystem so offline builds work |
| `race.py` | Fires many identical or templated requests at the same instant, several rounds, and records every response |
| `replay.py` | Sends one request many times, optionally with a request-key header, and reports whether responses were identical |
| `viewport-check.mjs` | Screenshots a page at phone and desktop widths and reports console errors, page errors and overflow |
| `evidence-pack.sh` | Bundles the diff, commits, logs and screenshots for one work item into its evidence folder |
| `cost-log.md` | One row per seat per run: tokens, estimated cost, wall time |
| `cost-capture.md` | Where the cost numbers come from |
| `room-export.md` | How and where to save the room after each run |
| `tests/` | Fixtures proving the lint and the container check catch what they should |

Setup for the viewport check: `npm ci` inside `tools/` (it uses the installed Chrome or Edge).
The Python tools need only the standard library.
