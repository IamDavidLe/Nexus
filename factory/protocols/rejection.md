# Rejection

A rejection is a gift of a failing test. It must be specific enough that the receiving seat can
reproduce the failure in one step, without asking anything.

## A valid rejection contains

1. **Work item** — board ID, and the commit that was reviewed.
2. **Failing command** — the exact command, runnable from a clean checkout of that commit.
3. **Observed vs expected** — what the command printed or returned, and what the task (quoted, with
   its location) says it should be.
4. **Smallest reproduction** — the fewest steps, inputs or parallel requests that still fail. If the
   failure is timing-dependent, how many runs out of how many failed.
5. **Criterion or invariant broken** — which acceptance criterion or stated invariant this violates.

## Rules

- **Vague rejections are rejected.** If a rejection lacks any section above, the receiving seat
  replies with a rejection of the rejection, naming the missing section, and does not change code.
- Reviewers reject on evidence, never on taste. Style preferences go in a note, not a rejection,
  unless the task states the rule.
- Every rejection is recorded on the work item's board history so the review impact is traceable.
- Only rejections reset review. A fix produces a new packet; both reviewers review the new commit.
- A seat never "fixes it themselves" outside its ownership. The Verifier and Breaker commit test
  code only; product fixes always go back to the Builder.
