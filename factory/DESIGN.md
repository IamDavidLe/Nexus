# Factory design

A five-seat band that turns one written task into a working, verified service with no human
steering after dispatch. The same seats, mandates and protocols are meant to build anything:
a compiler, a scheduler, a search service. Everything specific to one job lives in `tasks/`.

## The seats

| Seat | Writes product code? | Owns | Can reject? |
|------|---------------------|------|-------------|
| **Planner** | No | The board: stage goal, work items with acceptance criteria, dependency order, rescoping | Its own drafts: ambiguous or untestable work items never leave the Planner |
| **Builder** | Yes | Implementing work items, unit tests, build and run files | Work items that lack testable acceptance criteria |
| **Verifier** | No (acceptance tests only) | Independent checks derived from the task text; the clean offline container check; viewport checks | Any handoff without a complete evidence packet, or with any failing check |
| **Breaker** | No (adversarial tests only) | Attacks on every invariant the task states: concurrency, replays, boundaries, precision, time | Any handoff where an attack succeeds |
| **Integrator** | Glue only | Stage folder assembly, previous-stage regression runs, release note, stop conditions, the stage outcome | Release, until both Verifier and Breaker have signed off on the final state |

**The story:** two of five seats cannot ship product code. Their only power is refusal. Review
has to visibly change the code, and the room history plus `git log` prove it did.

## Why this shape

- **Separation of writing and judging.** The Builder never grades its own work. The Verifier
  derives checks from the task, never from the Builder's code or tests, so shared blind spots
  don't pass silently.
- **An adversary with a narrow brief.** The Breaker only attacks stated invariants, at or above
  the load the task states. A narrow brief keeps it effective and cheap.
- **Evidence over assertion.** Every handoff carries a packet of commands and real output
  (`protocols/handoff.md`). No packet means automatic rejection, so "trust me" never ships.
- **Guarantees at the storage layer.** Correctness rules are enforced where data lives
  (constraints, atomic operations), not only in application code, because concurrent callers
  bypass application-level checks.
- **Extend without breaking.** Every stage starts from a copy of the previous stage with its
  full suite green, and keeps it green (`protocols/extend-without-breaking.md`).
- **Autonomy by construction.** Seats never ask the human. They record an assumption and
  proceed (`protocols/autonomy.md`). Reject loops are capped, then rescoped.

## Runtime

| Seat | Runtime |
|------|---------|
| Planner, Builder, Verifier, Integrator | Claude Code |
| Breaker | Featherless-hosted open coder model (model diversity in review, lower cost). Claude Code until the key is available. |

Setup mechanics: `factory/BAND-SETUP.md`.

## The protocols

| File | Governs |
|------|---------|
| `protocols/workflow.md` | The loop from dispatched task to declared stage outcome |
| `protocols/board.md` | How work items live on the room board |
| `protocols/handoff.md` | The evidence packet every handoff carries |
| `protocols/rejection.md` | What a valid rejection contains |
| `protocols/definition-of-done.md` | When a work item and a stage are done |
| `protocols/autonomy.md` | Never asking the human; assumptions; reject-cycle cap |
| `protocols/stop-conditions.md` | Time and token boxes; what ships when they run out |
| `protocols/extend-without-breaking.md` | Stage-to-stage continuity |
| `protocols/git.md` | Commit prefixes and traceability to the room |

Templates for work items and handoffs are in `factory/templates/`.
