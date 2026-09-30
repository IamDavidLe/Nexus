# Stage 1 — Accounts and transfers

Build the money core: accounts that hold a balance, and transfers that move value between them
without ever creating, destroying or double-spending it.

Output folder: **`stage-1/`**. Everything you produce — source, tests, Dockerfile, evidence,
handoff packets, plan, assumptions, release note — lives under `stage-1/`. Do not modify anything
outside it.

Assumptions are allowed. Record each one in `stage-1/ASSUMPTIONS.md` with the choice you made and
why. **Do not ask for clarification. There is no human to answer.**

---

## Required stack

**Python 3.11 standard library only, with SQLite as the store. No pip install, no third-party
packages, no npm, no build step.**

Rationale: the clean offline container check builds with no network access, so every dependency
must already be in the base image. `python:3.11-slim` ships `sqlite3` in the standard library, which
gives real transactions, `CHECK` constraints and row-level write locking with zero vendoring. The
strongest available guarantee for the invariants below is therefore enforceable in the storage layer
itself rather than in application code. The interface is server-rendered HTML plus plain CSS and
vanilla JS served by the same process — no bundler, nothing to install.

Serve HTTP with `http.server`/`socketserver` from the standard library. Open the database with
`isolation_level=None` and drive transactions explicitly so you control locking.

---

## Interface contract

All request and response bodies are JSON, `Content-Type: application/json`. All monetary amounts are
**integers in minor units (cents)**. An amount that is not a JSON integer is rejected.

### `GET /healthz`
`200` → `{"status":"ok"}`. Must answer within 1s of container start.

### `POST /accounts`
Request: `{"name": "<1-64 chars>", "opening_balance": <integer >= 0>}`
`201` → `{"id":"<uuid>","name":"...","balance":<integer>}`
`422` → `{"error":"invalid_request","detail":"..."}` when name is empty/too long, or
`opening_balance` is negative, missing, or not an integer.

### `GET /accounts`
`200` → `{"accounts":[{"id","name","balance"}, ...]}` ordered by creation time.

### `GET /accounts/{id}`
`200` → `{"id","name","balance"}` · `404` → `{"error":"not_found"}`

### `POST /transfers`
Header: `Idempotency-Key: <1-128 chars>` — **required**.
Request: `{"source_id":"<uuid>","destination_id":"<uuid>","amount":<integer >= 1>}`
`201` → `{"id","source_id","destination_id","amount","status":"completed","created_at":"<ISO 8601>"}`
- `422 invalid_request` — amount not a positive integer, source equals destination, body malformed.
- `404 not_found` — either account does not exist.
- `409 insufficient_funds` — source balance is less than amount. Nothing is written.
- `400 missing_idempotency_key` — header absent or empty.
- `409 idempotency_key_reused` — same key, **different** request body.

### `GET /transfers/{id}`
`200` → the transfer object · `404` → `{"error":"not_found"}`

### `GET /transfers?account_id=<uuid>`
`200` → `{"transfers":[...]}` newest first, transfers where the account is source or destination.

---

## Invariants

These are the point of the stage. Each must be enforced at the storage layer where possible, and each
must be attacked under concurrency.

- **I1 — Conservation.** The sum of all account balances is unchanged by any number of transfers,
  concurrent or sequential, successful or rejected. Sum before = sum after, exactly, in integer
  minor units. There is no external money movement in this stage; every cent enters only through
  `opening_balance` at account creation.
- **I2 — No negative balance.** No account balance is ever negative, at any instant, under any
  interleaving. Enforce with a `CHECK (balance >= 0)` constraint, not only an application check.
- **I3 — Idempotency.** Replaying a `POST /transfers` with the same `Idempotency-Key` and the same
  body returns the same response with the same transfer `id`, and moves money **exactly once** —
  including when the replays arrive simultaneously.
- **I4 — Double entry.** Every completed transfer writes exactly two ledger entries, one negative
  and one positive, summing to zero, committed in the **same database transaction** as the balance
  updates. For every account, the sum of its entries plus its opening balance equals its current
  balance.
- **I5 — No floats in the money path.** No `float`, no `Decimal`-to-float conversion, no JSON parse
  that yields a float for an amount, anywhere between request parsing and storage. Reject
  `1.5`, `"10"`, `1e2` and `true` as amounts.

### Required concurrency behaviour
Serialize writes against the source account so two concurrent transfers cannot both read the same
balance and both succeed. `BEGIN IMMEDIATE` plus a single `UPDATE ... WHERE balance >= ?` guarded by
the `CHECK` constraint is sufficient; a lost update is a defect. Enable WAL mode. Under contention a
request must either succeed or return `409 insufficient_funds` — never `500`, never a partial write.

---

## Runtime limits

- One container, one process, no external services. SQLite file inside the container.
- Starts and answers `/healthz` within **5 seconds**, 512 MB memory ceiling.
- Survives **50 concurrent requests × 5 rounds** against a single source account with no error
  other than `409 insufficient_funds`, and no invariant violation.
- Survives **20 simultaneous replays** of one idempotency key with exactly one money movement.

## Offline container rules

- `stage-1/Dockerfile` builds from a pinned base image with **no network access during build**.
- `docker run --network none` must start the service and pass the health check.
- The check is `tools/clean-container-check.sh stage-1`. It must pass. Do not weaken the check.

## Required interface

A usable web UI served by the same process at `/`:

- List accounts with balances, formatted as currency for display only (integers in the data path).
- Create an account.
- Make a transfer: pick source and destination, enter an amount, submit. Generate a fresh
  idempotency key per submission client-side.
- Show a transfer history for a selected account.
- Explicit **loading, empty and error** states. A `409 insufficient_funds` must read as a clear
  human message, not a raw status code.
- Works at **375px** and at desktop width. Fully keyboard operable, visible focus states.
- **No console errors or warnings.** Verified with `tools/viewport-check.mjs`; save screenshots at
  both widths under `stage-1/evidence/`.

## Definition of done

`factory/protocols/definition-of-done.md` applies in full. In particular: both reviewers sign off on
the reviewed commit, the Breaker runs an attack for **every** invariant above at or above the stated
load, the offline container check passes, the UI is verified at both widths, assumptions are
recorded, and the Integrator posts the release note and stage outcome to the room.

### Evidence required under `stage-1/evidence/`
- `race.jsonl` + the conservation check proving I1 held across it.
- `replay.jsonl` proving I3 moved money once.
- `container-check.log` from the offline check.
- Viewport screenshots at 375px and desktop.
- The full test suite output, green, on the final commit.
