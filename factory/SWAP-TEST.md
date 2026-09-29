# Swap test

The rules say a mandate is generic if it would still make sense for a completely different job.
Each mandate was reread against three unrelated projects. One sentence per seat per project records
how the mandate applies unchanged. Where a mandate clause didn't apply, it had to be optional by its
own wording ("where the task involves time", "when the item touches the interface"), not rewritten.

| Seat | A command-line compiler | A hospital shift scheduler | An e-commerce search service |
|------|------------------------|---------------------------|------------------------------|
| **Planner** | Splits "compile the language" into lexer, parser, type checker and code generator items, each with golden-file criteria, ordering the riskiest (type soundness) early. | Maps every staffing rule in the task (rest periods, qualifications, maximum hours) to a work item with a checkable criterion and a coverage list. | Turns indexing, query parsing, ranking and filtering into items whose criteria are result sets for fixed queries. |
| **Builder** | Implements one compiler pass per item test-first; "storage layer" is the symbol table's invariants, "exact arithmetic" covers constant folding, "safe to retry" is a no-op for a pure CLI. | Enforces "no nurse double-booked" and "minimum rest" as database constraints and atomic updates, and makes shift claims safe to retry with a request key. | Makes index updates idempotent so a re-sent product update doesn't duplicate documents, and vendors the search library for an offline build. |
| **Verifier** | Writes its own test programs from the language spec, never from the compiler's tests, and runs the build in the offline container. | Derives schedule checks from the stated rules, runs the container check, and checks the rota screen at phone and desktop widths. | Checks queries from the task against expected results it wrote itself, and checks the search page's empty and error states. |
| **Breaker** | Attacks boundaries and precision (deep nesting, huge literals, overflow in constant folding); the time and concurrency attacks don't apply because the task states no such invariants. | Fires parallel claims for the last open shift at the stated concurrency and checks storage for double-booking; attacks day and month boundaries and time zones on overnight shifts. | Replays the same update many times and checks the index count; attacks boundaries (empty query, very long query, malformed filters). |
| **Integrator** | Assembles the compiler stage, reruns the previous stage's golden tests, and ships the last verified state if the time box runs out. | Merges accepted rules, reruns stage 1's rota suite after stage 2 adds swap requests, and writes the release note with every assumption. | Reruns the stage 1 relevance suite after stage 2 adds facets, and refuses release until both reviewers sign off on the same commit. |

## Result

All five mandates read correctly for all three projects without edits. Clauses that are
domain-sensitive (storage-level guarantees, retry safety, exact arithmetic, time attacks) are phrased
as general engineering duties that either apply or are vacuous for a given task; none names a domain.

Mechanical check: `tools/lint-mandates.sh` passes on every mandate, protocol and tool doc, and CI
reruns it, plus a self-test proving it still detects violations, on every push.
