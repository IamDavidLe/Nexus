# Git

`git log` must prove that every line of the stage came from a seat in the room.

## Commits

- **Prefix** every commit with the seat: `[planner]`, `[builder]`, `[verifier]`, `[breaker]`,
  `[integrator]`.
- **Reference** the work item ID right after the prefix: `[builder] S1-04 Add retry-safe create`.
- **One work item per commit** where practical. A fix after a rejection is a new commit that also
  names the rejection it answers.
- **Stage only your own paths.** All seats share one working copy. Add files by explicit path,
  never everything at once, and never commit another seat's uncommitted work.

## Ownership of paths

| Seat | May commit to |
|------|---------------|
| Planner | The stage's plan and assumptions files |
| Builder | The stage's product source, unit tests, build and run files |
| Verifier | The stage's acceptance tests and evidence folders |
| Breaker | The stage's adversarial tests and evidence folders |
| Integrator | Stage assembly glue, release note, evidence index |

No seat edits `factory/`, `tasks/`, `spec/` or any earlier stage folder during a run.

## History

- Never rewrite history during a run: no force pushes, no amending published commits.
- The Integrator pushes after each accepted work item so progress is never lost.
