# Stage 1 — Assumptions

Per `factory/protocols/autonomy.md`, every ambiguity is resolved by the most conservative reasonable
reading, recorded here, announced in the room, and proceeded on. No seat asks the human anything.

Each entry: **question** · **choice** · **why** · **what changes if the choice is wrong**.

Seats append their own entries below the Planner block, naming their seat and the work item ID.

---

## Planner assumptions (set at dispatch)

### A1 — Listening port
**Question.** The task fixes the health path (`/healthz`) but never states a port.
**Choice.** The service listens on **8080**, read from the `PORT` environment variable with `8080` as
the default. The canonical offline check invocation is
`tools/clean-container-check.sh stage-1 --health-path /healthz --port 8080`.
**Why.** The check tool takes the port from the task, so one value must be fixed somewhere; 8080 is
unprivileged, so the container needs no root. Reading it from the environment makes it a one-flag
change later.
**If wrong.** One default constant and the `--port` flag in the check command change. No code
structure depends on it.

### A2 — Base image, and how "no network during build" is satisfied
**Question.** The task requires a pinned base image and a build with no network access. A
`docker build --network none` cannot pull a base image it does not already have locally.
**Choice.** `stage-1/Dockerfile` pins `python:3.11-slim` **by digest** (`python:3.11-slim@sha256:...`).
Having that image already in the local Docker image cache is treated as tooling setup, exactly as
`tools/clean-container-check.sh` already treats its `busybox:1.36` probe image, which it pulls up
front before running the networkless build. Nothing the product needs is fetched during the build
itself: the image runs no package manager and installs nothing.
**Why.** This is the only reading under which the stated rule is satisfiable at all, and it matches
the check tool's own behaviour for its probe image. The rule's intent — no product dependency is
downloaded at build time — is honoured in full.
**If wrong.** The Dockerfile would have to vendor a base filesystem (`tools/offline-deps.md`). The
application source is unaffected.

### A3 — Database location and lifetime
**Question.** The task says "SQLite file inside the container" but not where, nor whether data
survives a restart.
**Choice.** `/data/app.db`, with the directory created in the image and the path overridable by the
`DB_PATH` environment variable. The schema is created on start if absent; an existing file is reused
and never wiped. No `VOLUME` is declared, so a fresh `docker run` starts empty.
**Why.** The stage states no persistence requirement, and nothing should promise a durability
guarantee the task did not ask for. Reusing an existing file is the safer of the two behaviours: it
can never destroy data a later stage decides to keep.
**If wrong.** A later stage adds a `VOLUME` line and nothing else.

### A4 — Display currency
**Question.** The interface must format balances "as currency for display only". No currency is named.
**Choice.** US-dollar style, `$1,234.56`, produced from the integer cents in the **view layer only**,
by integer division and remainder — never by constructing a float. Every value crossing the network
or reaching storage stays an integer in minor units.
**Why.** A currency has to be picked to render at all, and the task's own wording ("cents") points at
a two-decimal minor unit. Confining formatting to the view keeps I5 untouched by the choice.
**If wrong.** One formatting function changes. The data path is unaffected by construction, which is
itself an acceptance criterion of S1-09.

### A5 — `created_at` format
**Question.** The contract says `"created_at":"<ISO 8601>"` without fixing precision or zone.
**Choice.** UTC, `YYYY-MM-DDTHH:MM:SS.ffffffZ` (microseconds, literal `Z`).
**Why.** UTC with an explicit zone designator is unambiguous, and it sorts lexicographically in the
same order as it sorts chronologically. Microsecond precision keeps concurrently created transfers
distinguishable.
**If wrong.** A single formatting helper changes. The ordering of `GET /transfers?account_id=` does
not depend on the rendered string: it orders by a monotonic integer sequence.

### A6 — Identifier format
**Question.** Account ids are `<uuid>`; the transfer `id` is left unspecified.
**Choice.** Both are UUID4, canonical lowercase hyphenated form.
**Why.** Consistency with the stated account id type. The transfer filter already takes a `<uuid>`
account id, so the system is uuid-shaped throughout.
**If wrong.** Only the generator changes; ids are opaque strings everywhere else.

### A7 — Idempotency key scope, and what "same body" means
**Question.** `409 idempotency_key_reused` fires on "same key, **different** request body". Neither
the key's scope nor the comparison rule is defined.
**Choice.** Keys are **global**, not scoped per account or per caller. "Same body" means the three
validated fields `source_id`, `destination_id` and `amount` are equal after parsing and validation;
key ordering and whitespace do not make two bodies different. The comparison is made against a
canonical form stored with the key, not against the raw request bytes.
**Why.** A global scope is the stricter of the two readings: it can only reject more, never replay a
transfer across callers that a scoped reading would have let through twice. Comparing validated
fields rather than raw bytes prevents a retrying client from being told `409` merely because its JSON
serializer reordered keys — which would break I3's "replaying returns the same response".
**If wrong.** The stored canonical form gains a scope column. The `409` rule itself is unchanged.

### A8 — Unknown paths and wrong methods
**Question.** The contract does not say what an unlisted route, or a listed route reached with the
wrong method, returns.
**Choice.** Unknown path → `404 {"error":"not_found"}`. Known path, unsupported method →
`405 {"error":"method_not_allowed"}` with an `Allow` header. Both bodies are JSON.
**Why.** It reuses the contract's own `not_found` shape and keeps every body JSON, as the task
requires. Neither case may be a `500`.
**If wrong.** Two router branches change; no stated endpoint behaviour moves.

### A9 — `GET /transfers?account_id=` for an account that does not exist
**Question.** This endpoint's contract lists only `200`. The two `{id}` endpoints list `404`.
**Choice.** A syntactically valid `account_id` matching no account returns `200` with
`{"transfers":[]}`. A missing, empty or non-uuid `account_id` returns `422 invalid_request`.
**Why.** The task specified `404` explicitly for `GET /accounts/{id}` and `GET /transfers/{id}` and
did not for this one; the conservative reading honours the contract exactly as written rather than
inventing a status it does not list. A malformed query parameter is a malformed request, which the
task does treat as `422` throughout.
**If wrong.** One branch changes. The UI's "no transfers yet" empty state covers the display case
either way.

### A10 — Name validation
**Question.** `"name": "<1-64 chars>"`; "chars" is not defined, and trimming is not specified.
**Choice.** Length is counted in **Unicode code points** and must be 1–64 inclusive. A name that is
empty or whitespace-only is rejected `422 invalid_request`. A non-string name is `422`. The name is
stored exactly as sent; it is not silently trimmed.
**Why.** Code points are what `len` reports on a Python `str`, so the check and the stored value
agree. Rejecting whitespace-only names honours "name is empty" without mutating caller data behind
its back.
**If wrong.** One validator changes, and the tests pinning it change with it.

### A11 — Upper bound on money
**Question.** `opening_balance` is bounded below (`>= 0`) and `amount` below (`>= 1`); neither is
bounded above.
**Choice.** Any integer that does not fit a signed 64-bit range (`|v| >= 2**63`) is rejected
`422 invalid_request`, for both `opening_balance` and `amount`.
**Why.** SQLite stores integers in at most 64 bits. Accepting a larger Python integer would either
raise at the driver or silently lose exactness — and an inexact cent is precisely what I1 forbids.
Rejecting at the edge keeps every stored value exact.
**If wrong.** The bound moves; nothing else does. Recording it here means a later stage can widen it
deliberately rather than discovering it as a defect.

### A12 — What "the full test suite" is
**Question.** The evidence must include "the full test suite output, green". No runner is named, and
the stack forbids installing one.
**Choice.** The standard library's `unittest`. The suite is exactly
`python -m unittest discover -s tests -t . -v`, run from inside `stage-1/`. Builder unit tests,
Verifier acceptance tests and Breaker attack tests all live under `stage-1/tests/` and are all
discovered by that one command.
**Why.** It ships in the standard library, so it violates no dependency rule, and a single command
makes "the full suite" unambiguous for every seat and for the final evidence.
**If wrong.** Only the command recorded in the evidence changes; the tests are plain `unittest` cases
either way.

### A13 — Serving model
**Question.** The task names `http.server`/`socketserver` and requires surviving 50 concurrent
requests, but does not say how concurrency is served.
**Choice.** `ThreadingHTTPServer` (`socketserver.ThreadingMixIn`) in **one process**, one SQLite
connection per thread, every connection opened with `isolation_level=None` and WAL enabled.
Transactions are driven explicitly with `BEGIN IMMEDIATE`. `SQLITE_BUSY` is absorbed by a bounded
retry with backoff inside the request, so lock contention surfaces as a completed request or a
`409 insufficient_funds`, never as a `500`.
**Why.** A threaded server is the only way to have 50 requests genuinely in flight in one process,
which is what the contention requirement tests. Per-thread connections are required because a SQLite
connection is not safe to share across threads.
**If wrong.** The server class changes. The storage layer is written to be correct under any number
of concurrent writers, so it does not move.

### A14 — Where the room plan snapshot is generated from
**Question.** The task says everything produced lives under `stage-1/`. The room runtime requires the
plan and diagram to be published from fixed workspace-root paths.
**Choice.** `stage-1/PLAN.md` and this file are the committed, canonical artifacts. The
workspace-root `plan.md` and `architecture.json` are transient publish sources: generated from the
stage files, published as immutable room snapshots, then removed, so the repository tree outside
`stage-1/` is left unmodified.
**Why.** It satisfies both rules exactly, and an immutable snapshot never follows a local file, so
removing the source cannot affect what the room shows.
**If wrong.** Nothing in the product is affected.
