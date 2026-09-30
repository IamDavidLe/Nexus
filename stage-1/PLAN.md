# Stage 1 — Accounts and transfers · Plan

**Planner:** @rohitmaruriats/planner · **Board goal:** Stage 1 — Accounts and transfers
**Task:** `tasks/stage-1.task.md` · **Output folder:** `stage-1/` · **Assumptions:** `stage-1/ASSUMPTIONS.md`

> Build the money core: accounts that hold a balance, and transfers that move value between them
> without ever creating, destroying or double-spending it.

Stage 1 is the first stage, so there is no "copy the previous stage and prove its suite green" item
(`factory/protocols/extend-without-breaking.md` applies from stage 2 onward).

---

## Ordering rationale

The invariants are the point of the stage, so they are attacked while there is time:

1. **I5 lands first** (S1-01). The strict integer parser is the single chokepoint every amount
   crosses; if it is added late, every endpoint built before it has to be re-audited.
2. **I2 and I4 land second, in SQL** (S1-02). The task requires enforcement "at the storage layer
   where possible". Building the schema before any handler means application code is never the only
   thing standing between a bug and a negative balance.
3. **I1 and the write path** follow (S1-04), then **I3** (S1-05), then the **contention
   requirement** (S1-06) — the riskiest thing in the stage, given a full hour of remaining budget
   rather than the last ten minutes.
4. The **offline container** (S1-08) is deliberately early, not last: an offline build that fails is
   discovered while there is still room to change the Dockerfile.
5. The interface (S1-09 … S1-11) sits on a frozen API.
6. Independent review artifacts (S1-12 Breaker, S1-13 Verifier) and assembly (S1-14) close the stage.

## Ordered work items

| ID | Title | Owner | Depends on |
|----|-------|-------|------------|
| S1-01 | HTTP skeleton, `/healthz`, and the strict integer money parser (I5) | Builder | — |
| S1-02 | SQLite schema with storage-enforced invariants (I2, I4) | Builder | — |
| S1-03 | Accounts API: create, list, fetch | Builder | S1-01, S1-02 |
| S1-04 | Transfer core: double-entry money movement and `GET /transfers/{id}` (I1, I2, I4) | Builder | S1-02, S1-03 |
| S1-05 | Idempotent transfers (I3) | Builder | S1-04 |
| S1-06 | Serialized writes under contention: 50×5 with no `500` and no lost update | Builder | S1-05 |
| S1-07 | Transfer history query: `GET /transfers?account_id=` | Builder | S1-04 |
| S1-08 | Offline Dockerfile and the clean container check | Builder | S1-01 |
| S1-09 | Web UI: accounts list and create, with loading / empty / error states | Builder | S1-03 |
| S1-10 | Web UI: transfer form with a fresh idempotency key, and account history | Builder | S1-05, S1-07, S1-09 |
| S1-11 | Interface quality: 375px and desktop, keyboard, focus, zero console errors | Builder | S1-10 |
| S1-12 | Attack suite and invariant evidence (race, replay, conservation) | Breaker | S1-06, S1-08 |
| S1-13 | Independent acceptance suite from the task text | Verifier | S1-07, S1-11 |
| S1-14 | Stage assembly, green full suite, evidence index, release note | Integrator | S1-12, S1-13 |

Every command below is run from inside `stage-1/` unless the path says otherwise. The full suite is
`python -m unittest discover -s tests -t . -v` (assumption A12). The service runs on port 8080
(assumption A1).

---

## S1-01 — HTTP skeleton, `/healthz`, and the strict integer money parser (I5)

**Stage:** 1  **Owner:** Builder  **Status:** ready
**Depends on:** none

### Goal
A single-process standard-library HTTP service that starts, answers `GET /healthz` with
`{"status":"ok"}`, routes JSON requests and responses, and rejects every non-integer amount at one
shared chokepoint before it can reach any handler.

### Acceptance criteria
1. `GET /healthz` returns `200` with body exactly `{"status":"ok"}` and
   `Content-Type: application/json` — checked by: `python -m unittest tests.test_health -v`
2. The service is answering `/healthz` **within 1 second** of process start, measured from spawn to
   first successful response — checked by: `python -m unittest tests.test_health.HealthTimingTest -v`
3. A shared parser accepts a JSON integer and rejects each of `1.5`, `"10"`, `1e2`, `true`, `false`,
   `null`, `[]`, `{}` and a missing field, in every case with `422`
   `{"error":"invalid_request","detail":"..."}` — checked by:
   `python -m unittest tests.test_amounts -v`
4. `json.loads` is called with a `parse_float` hook that raises, so no `float` object can be
   constructed from a request body at all; a body containing `1e400`, `NaN`, `Infinity` or `-Infinity`
   is `422`, not a parse crash — checked by: `python -m unittest tests.test_amounts.NoFloatTest -v`
5. An integer whose magnitude is at least `2**63` is rejected `422` (assumption A11) — checked by:
   `python -m unittest tests.test_amounts.RangeTest -v`
6. A malformed body (invalid JSON, non-object top level, wrong `Content-Type`, empty body) is `422`
   `invalid_request`, never `500` — checked by: `python -m unittest tests.test_amounts.MalformedTest -v`
7. An unknown path returns `404 {"error":"not_found"}` and a known path with an unsupported method
   returns `405` with an `Allow` header, both JSON (assumption A8) — checked by:
   `python -m unittest tests.test_routing -v`
8. `grep -rnE '\bfloat\(|\bDecimal\b|/[^/]' src/` shows no float division or float construction on
   any request-handling path; the item's packet quotes the grep output — checked by:
   `python -m unittest tests.test_amounts.SourceScanTest -v`, which runs the scan as a test.

### Invariants touched
> "**I5 — No floats in the money path.** No `float`, no `Decimal`-to-float conversion, no JSON parse
> that yields a float for an amount, anywhere between request parsing and storage. Reject `1.5`,
> `"10"`, `1e2` and `true` as amounts." — task, *Invariants*

> "`GET /healthz` `200` → `{"status":"ok"}`. Must answer within 1s of container start." — task,
> *Interface contract*

### Out of scope
No database, no accounts, no transfers, no UI. The parser is exercised through a throwaway test-only
route if needed; no product endpoint that stores money exists yet.

### Source in the task
*Required stack* ("Python 3.11 standard library only… Serve HTTP with `http.server`/`socketserver`"),
*Interface contract* (`GET /healthz`, "All request and response bodies are JSON", "All monetary
amounts are **integers in minor units (cents)**. An amount that is not a JSON integer is rejected"),
*Invariants* (I5).

---

## S1-02 — SQLite schema with storage-enforced invariants (I2, I4)

**Stage:** 1  **Owner:** Builder  **Status:** ready
**Depends on:** none

### Goal
A schema module that creates the `accounts`, `ledger_entries`, `transfers` and `idempotency_keys`
tables with the invariants enforced by SQLite itself, opens connections with `isolation_level=None`
and WAL, and is proven to reject violations even when attacked with raw SQL that bypasses every line
of application code.

### Acceptance criteria
1. `accounts.balance` carries `CHECK (balance >= 0)`; a direct
   `UPDATE accounts SET balance = -1` raises `sqlite3.IntegrityError` — checked by:
   `python -m unittest tests.test_schema.CheckConstraintTest -v`
2. `accounts.balance` and `ledger_entries.amount` are declared `INTEGER NOT NULL`; inserting a
   `float`, a numeric string or `NULL` into either raises rather than coercing — checked by:
   `python -m unittest tests.test_schema.IntegerOnlyTest -v`
3. Every connection reports `PRAGMA journal_mode` = `wal` and is opened with `isolation_level=None`
   — checked by: `python -m unittest tests.test_schema.ConnectionModeTest -v`
4. `PRAGMA foreign_keys` is `on`, and `ledger_entries.account_id` / `transfers.source_id` /
   `transfers.destination_id` are foreign keys to `accounts(id)`; an entry for an unknown account
   raises — checked by: `python -m unittest tests.test_schema.ForeignKeyTest -v`
5. `idempotency_keys.key` is `UNIQUE NOT NULL` with a `CHECK` on length 1–128; a second insert of the
   same key raises `sqlite3.IntegrityError` — checked by:
   `python -m unittest tests.test_schema.IdempotencyKeyTest -v`
6. `transfers.status` is constrained to the values the contract can return, and
   `CHECK (source_id <> destination_id)` and `CHECK (amount >= 1)` are present; each violation raises
   — checked by: `python -m unittest tests.test_schema.TransferConstraintTest -v`
7. Opening the schema twice against the same file is a no-op the second time, and an existing file is
   never wiped (assumption A3) — checked by: `python -m unittest tests.test_schema.IdempotentInitTest -v`
8. A reusable `check_conservation(conn)` helper returns the sum of all balances, the sum of all ledger
   entries plus opening balances, and whether they agree per account and in total; it reports a
   mismatch on a deliberately corrupted fixture — checked by:
   `python -m unittest tests.test_schema.ConservationHelperTest -v`

### Invariants touched
> "**I2 — No negative balance.** … Enforce with a `CHECK (balance >= 0)` constraint, not only an
> application check." — task, *Invariants*

> "**I4 — Double entry.** … For every account, the sum of its entries plus its opening balance equals
> its current balance." — task, *Invariants*

> "Open the database with `isolation_level=None` and drive transactions explicitly so you control
> locking." / "Enable WAL mode." — task, *Required stack* and *Required concurrency behaviour*

### Out of scope
No HTTP, no request validation, no transfer logic. This item creates and constrains storage and the
conservation helper; the helper is used as evidence by S1-04, S1-06 and S1-12.

### Source in the task
*Required stack* (SQLite, `isolation_level=None`), *Invariants* (I2, I4), *Required concurrency
behaviour* ("Enable WAL mode").

---

## S1-03 — Accounts API: create, list, fetch

**Stage:** 1  **Owner:** Builder  **Status:** planned
**Depends on:** S1-01, S1-02

### Goal
The three account endpoints behave exactly as the interface contract states, with every stated error
case returning the stated status and body.

### Acceptance criteria
1. `POST /accounts` with a valid name and integer `opening_balance >= 0` returns `201`
   `{"id":"<uuid>","name":"...","balance":<integer>}` where `balance` equals `opening_balance` and
   `id` is a canonical UUID (assumption A6) — checked by:
   `python -m unittest tests.test_accounts_api.CreateTest -v`
2. `POST /accounts` returns `422` `{"error":"invalid_request","detail":"..."}` for each of: empty
   name, whitespace-only name, 65-code-point name, non-string name, missing `opening_balance`,
   negative `opening_balance`, `opening_balance` of `1.5` / `"10"` / `1e2` / `true`, and
   `opening_balance >= 2**63` — checked by:
   `python -m unittest tests.test_accounts_api.CreateRejectTest -v`
3. A 64-code-point name and a 1-code-point name are both accepted, and `opening_balance` of `0` is
   accepted — checked by: `python -m unittest tests.test_accounts_api.BoundaryTest -v`
4. `GET /accounts` returns `200` `{"accounts":[...]}` ordered by creation time, oldest first, proven
   with at least three accounts created in a known order — checked by:
   `python -m unittest tests.test_accounts_api.ListOrderTest -v`
5. `GET /accounts` on an empty database returns `200` `{"accounts":[]}`, not `404` — checked by:
   `python -m unittest tests.test_accounts_api.ListEmptyTest -v`
6. `GET /accounts/{id}` returns `200` with the account object, and `404` `{"error":"not_found"}` for
   both an unknown uuid and a syntactically invalid id — checked by:
   `python -m unittest tests.test_accounts_api.FetchTest -v`
7. Every response carries `Content-Type: application/json` and every `balance` in every response is a
   JSON integer, asserted by re-parsing the raw bytes with a `parse_float` hook that raises — checked
   by: `python -m unittest tests.test_accounts_api.IntegerWireTest -v`

### Invariants touched
> "**I5 — No floats in the money path.**" — task, *Invariants* (criterion 7 re-asserts it on the wire)

> "every cent enters only through `opening_balance` at account creation" — task, *Invariants*, I1.
> This item is the only writer of money into the system.

### Out of scope
Transfers, idempotency, UI. Account deletion, renaming and closing are not in the contract and are
not built.

### Source in the task
*Interface contract* — `POST /accounts`, `GET /accounts`, `GET /accounts/{id}`, quoted in full in the
criteria above.

---

## S1-04 — Transfer core: double-entry money movement and `GET /transfers/{id}` (I1, I2, I4)

**Stage:** 1  **Owner:** Builder  **Status:** planned
**Depends on:** S1-02, S1-03

### Goal
`POST /transfers` moves money between two accounts inside a single explicit transaction that writes
exactly two ledger entries and both balance updates together, with every stated error case returning
the stated status and writing nothing; `GET /transfers/{id}` reads it back.

### Acceptance criteria
1. A valid transfer returns `201` with `{"id","source_id","destination_id","amount",
   "status":"completed","created_at"}`, `created_at` matching `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$`
   (assumption A5) — checked by: `python -m unittest tests.test_transfers_core.HappyPathTest -v`
2. After a successful transfer the source balance fell by exactly `amount` and the destination rose
   by exactly `amount` — checked by: `python -m unittest tests.test_transfers_core.BalanceDeltaTest -v`
3. Exactly two ledger entries exist for the transfer, one negative and one positive, summing to `0`,
   and both were written in the **same** transaction as the balance updates — proven by a test that
   injects a failure between the two entry writes and asserts that nothing at all was committed —
   checked by: `python -m unittest tests.test_transfers_core.AtomicDoubleEntryTest -v`
4. For every account, opening balance plus the sum of its ledger entries equals its current balance,
   over a fixture of at least 50 sequential transfers — checked by:
   `python -m unittest tests.test_transfers_core.LedgerReconcilesTest -v`
5. The sum of all balances is identical before and after that fixture, and after a run that mixes
   successes with every rejection class — checked by:
   `python -m unittest tests.test_transfers_core.ConservationTest -v`
6. `422 invalid_request` for: `amount` of `0`, negative, `1.5`, `"10"`, `1e2`, `true`, missing;
   `source_id == destination_id`; malformed body — checked by:
   `python -m unittest tests.test_transfers_core.RejectInvalidTest -v`
7. `404 not_found` when either account does not exist, and nothing is written — checked by:
   `python -m unittest tests.test_transfers_core.RejectMissingAccountTest -v`
8. `409 insufficient_funds` when the source balance is less than `amount`, **nothing is written**
   (no transfer row, no ledger entry, no balance change), including the exact boundary where
   `amount == balance + 1`; `amount == balance` succeeds and leaves the source at `0` — checked by:
   `python -m unittest tests.test_transfers_core.InsufficientFundsTest -v`
9. `GET /transfers/{id}` returns `200` with the transfer object and `404` `{"error":"not_found"}` for
   an unknown or malformed id — checked by: `python -m unittest tests.test_transfers_core.FetchTest -v`
10. The write path uses `BEGIN IMMEDIATE` and a single `UPDATE ... WHERE balance >= ?` guarded by the
    `CHECK` constraint; a source-scan test asserts both are present and that no balance is ever
    written from a value read in an earlier, separate transaction — checked by:
    `python -m unittest tests.test_transfers_core.WritePathShapeTest -v`

### Invariants touched
> "**I1 — Conservation.** The sum of all account balances is unchanged by any number of transfers,
> concurrent or sequential, successful or rejected." — task, *Invariants*

> "**I2 — No negative balance.** No account balance is ever negative, at any instant, under any
> interleaving." — task, *Invariants*

> "**I4 — Double entry.** Every completed transfer writes exactly two ledger entries, one negative and
> one positive, summing to zero, committed in the **same database transaction** as the balance
> updates." — task, *Invariants*

> "`409 insufficient_funds` — source balance is less than amount. Nothing is written." — task,
> *Interface contract*

### Out of scope
The `Idempotency-Key` header (S1-05) and concurrency load (S1-06). This item's tests are sequential;
the header may be accepted and ignored here only if S1-05 follows immediately, and that gap is stated
in the packet.

### Source in the task
*Interface contract* — `POST /transfers`, `GET /transfers/{id}`; *Invariants* I1, I2, I4.

---

## S1-05 — Idempotent transfers (I3)

**Stage:** 1  **Owner:** Builder  **Status:** planned
**Depends on:** S1-04

### Goal
`Idempotency-Key` is required, a replay of the same key and body returns the same transfer with the
same id and moves money exactly once, and the same key with a different body is refused.

### Acceptance criteria
1. `POST /transfers` without the header, or with an empty header, returns `400`
   `{"error":"missing_idempotency_key"}` and writes nothing — checked by:
   `python -m unittest tests.test_idempotency.MissingKeyTest -v`
2. A key shorter than 1 or longer than 128 characters is rejected, and 1-character and
   128-character keys are accepted — checked by:
   `python -m unittest tests.test_idempotency.KeyLengthTest -v`
3. Sending the same key and body a second time returns the **same status, same transfer `id`, same
   `created_at` and byte-identical body** as the first — checked by:
   `python -m unittest tests.test_idempotency.ReplayIdenticalTest -v`
4. After ten sequential replays of one key, balances moved exactly once, exactly one transfer row
   exists, and exactly two ledger entries exist — checked by:
   `python -m unittest tests.test_idempotency.ReplayMovesOnceTest -v`
5. The same key with a different `amount`, a different `source_id`, or a different `destination_id`
   returns `409` `{"error":"idempotency_key_reused"}` and writes nothing — checked by:
   `python -m unittest tests.test_idempotency.KeyReusedTest -v`
6. The same key with the same validated fields but reordered JSON keys or different whitespace is a
   **replay**, not a `409` (assumption A7) — checked by:
   `python -m unittest tests.test_idempotency.CanonicalBodyTest -v`
7. A key whose first attempt failed with `409 insufficient_funds`, `404` or `422` does not block a
   later, different, valid request from succeeding on a **new** key, and replaying the failed key
   returns the same failure rather than a success — checked by:
   `python -m unittest tests.test_idempotency.FailedAttemptTest -v`
8. **20 simultaneous replays** of one key produce exactly one money movement, one transfer row and
   two ledger entries; every response carries the same transfer `id`, and none is a `500` — checked
   by: `python -m unittest tests.test_idempotency.ConcurrentReplayTest -v` and by
   `python ../tools/replay.py --template replay.json --count 20 --parallel --key-header Idempotency-Key --out evidence/replay.jsonl --ignore created_at`
9. The key row and the transfer are committed in the **same** transaction, so a crash can never leave
   a key recorded without its transfer or a transfer without its key — checked by:
   `python -m unittest tests.test_idempotency.KeyAtomicityTest -v`

### Invariants touched
> "**I3 — Idempotency.** Replaying a `POST /transfers` with the same `Idempotency-Key` and the same
> body returns the same response with the same transfer `id`, and moves money **exactly once** —
> including when the replays arrive simultaneously." — task, *Invariants*

> "Survives **20 simultaneous replays** of one idempotency key with exactly one money movement."
> — task, *Runtime limits*

### Out of scope
Key expiry or eviction: the task states no retention policy, so keys are kept for the life of the
database. Cross-account key scoping is decided in assumption A7 and is not revisited here.

### Source in the task
*Interface contract* — `POST /transfers` header and the `400` / `409` rows; *Invariants* I3;
*Runtime limits* (20 simultaneous replays).

---

## S1-06 — Serialized writes under contention: 50×5 with no `500` and no lost update

**Stage:** 1  **Owner:** Builder  **Status:** planned
**Depends on:** S1-05

### Goal
Concurrent transfers against one source account are serialized so two of them can never both read the
same balance and both succeed; under the task's stated load the service returns only successes and
`409 insufficient_funds`, never a `500` and never a partial write.

### Acceptance criteria
1. `tools/race.py` at **50 workers × 5 rounds** against a single source account produces only `201`
   and `409` responses — no `500`, no transport failure — checked by:
   `python ../tools/race.py --template race.json --workers 50 --rounds 5 --out evidence/race.jsonl`
   with exit code `0`, then `python -m unittest tests.test_contention.NoServerErrorsTest -v` which
   asserts the status counts in `evidence/race.jsonl`
2. Conservation holds across that run: the sum of all balances after equals the sum before, exactly —
   checked by: `python -m unittest tests.test_contention.RaceConservationTest -v`
3. No balance is negative at the end of the run, and the source account's final balance equals its
   opening balance minus the sum of the amounts of exactly the transfers that returned `201` —
   checked by: `python -m unittest tests.test_contention.NoLostUpdateTest -v`
4. The number of `201` responses equals the number of transfer rows and half the number of ledger
   entries — checked by: `python -m unittest tests.test_contention.RowCountTest -v`
5. A source account funded for exactly *k* transfers, hit by 50 concurrent requests for that amount,
   yields exactly *k* successes and `50 - k` `409`s — checked by:
   `python -m unittest tests.test_contention.ExactCapacityTest -v`
6. A deliberate `SQLITE_BUSY` storm (concurrent writers plus an artificially held write lock) still
   produces no `500`: the bounded retry absorbs it, and on exhaustion the request returns a JSON
   error that is not `500` — checked by: `python -m unittest tests.test_contention.BusyRetryTest -v`
7. The service is still healthy after the whole run: `GET /healthz` answers `200` and a subsequent
   sequential transfer succeeds — checked by:
   `python -m unittest tests.test_contention.SurvivesLoadTest -v`

### Invariants touched
> "Serialize writes against the source account so two concurrent transfers cannot both read the same
> balance and both succeed. `BEGIN IMMEDIATE` plus a single `UPDATE ... WHERE balance >= ?` guarded by
> the `CHECK` constraint is sufficient; a lost update is a defect. Enable WAL mode. Under contention a
> request must either succeed or return `409 insufficient_funds` — never `500`, never a partial
> write." — task, *Required concurrency behaviour*

> "Survives **50 concurrent requests × 5 rounds** against a single source account with no error other
> than `409 insufficient_funds`, and no invariant violation." — task, *Runtime limits*

Touches I1, I2 and I4 under interleaving.

### Out of scope
The Breaker's independent attack (S1-12) is separate and is not satisfied by this item; this is the
Builder proving its own write path before review.

### Source in the task
*Required concurrency behaviour*; *Runtime limits* (50 × 5).

---

## S1-07 — Transfer history query: `GET /transfers?account_id=`

**Stage:** 1  **Owner:** Builder  **Status:** planned
**Depends on:** S1-04

### Goal
An account's transfer history, newest first, covering transfers where the account is either the
source or the destination.

### Acceptance criteria
1. `GET /transfers?account_id=<uuid>` returns `200` `{"transfers":[...]}` containing every transfer
   where the account is source **or** destination, and no others — checked by:
   `python -m unittest tests.test_transfer_reads.MembershipTest -v`
2. The list is ordered newest first, proven over at least five transfers created in a known order,
   including two created within the same microsecond-resolution timestamp (ordering falls back to a
   monotonic sequence, assumption A5) — checked by:
   `python -m unittest tests.test_transfer_reads.OrderTest -v`
3. An account with no transfers returns `200` `{"transfers":[]}`; a valid uuid matching no account
   also returns `200` with an empty list (assumption A9) — checked by:
   `python -m unittest tests.test_transfer_reads.EmptyTest -v`
4. A missing, empty or non-uuid `account_id` returns `422 invalid_request` (assumption A9) — checked
   by: `python -m unittest tests.test_transfer_reads.BadParamTest -v`
5. Each element has the same shape and the same integer `amount` as `GET /transfers/{id}` returns for
   the same transfer — checked by: `python -m unittest tests.test_transfer_reads.ShapeParityTest -v`
6. A query against an account with 500 transfers returns all 500 and answers in under 2 seconds —
   checked by: `python -m unittest tests.test_transfer_reads.VolumeTest -v`

### Invariants touched
None directly. It is a read path; criterion 5 keeps I5 intact on the wire.

### Out of scope
Pagination, filtering by date, and filtering by direction: none is in the contract.

### Source in the task
*Interface contract* — "`GET /transfers?account_id=<uuid>` `200` → `{"transfers":[...]}` newest first,
transfers where the account is source or destination."

---

## S1-08 — Offline Dockerfile and the clean container check

**Stage:** 1  **Owner:** Builder  **Status:** planned
**Depends on:** S1-01

### Goal
`stage-1/Dockerfile` builds with no network access from a pinned base image, and the container runs
with `--network none` inside the stated resource caps and answers the health check.

### Acceptance criteria
1. `tools/clean-container-check.sh stage-1 --health-path /healthz --port 8080 --memory 512m --timeout 60`
   exits `0` and its log records `PASS` — checked by that command; the log is committed at
   `stage-1/evidence/container-check.log`
2. The check is run **without** `--allow-build-network`, so the build ran with `--network none` —
   proven by the log line `build network: none` in `stage-1/evidence/container-check.log`
3. The log records `ok: no outbound network`, proving the running container has no route out —
   proven by that line in the same log
4. The base image is pinned by digest (`FROM python:3.11-slim@sha256:...`), and the Dockerfile
   contains no `apt-get`, `pip`, `npm`, `curl`, `wget` or `ADD <url>` — checked by:
   `python -m unittest tests.test_container.DockerfileTest -v`
5. The container answers `/healthz` within **5 seconds** of `docker run`, measured in the test, well
   inside the check's timeout — checked by: `python -m unittest tests.test_container.StartupTimeTest -v`
6. The container stays inside a **512 MB** memory cap while serving the 50×5 race — checked by:
   `python -m unittest tests.test_container.MemoryCeilingTest -v`, which reads
   `docker stats --no-stream` during the run
7. `tools/clean-container-check.sh` itself is unmodified — checked by:
   `git diff --exit-code -- tools/clean-container-check.sh` (exit `0`)
8. The image runs as a non-root user and the database directory is writable by it — checked by:
   `python -m unittest tests.test_container.NonRootTest -v`

### Invariants touched
None directly. It is the delivery vehicle for everything else.

### Out of scope
Multi-stage builds, image size optimisation, and any orchestration beyond a single `docker run`.

### Source in the task
*Offline container rules* ("builds from a pinned base image with **no network access during build**",
"`docker run --network none` must start the service and pass the health check", "The check is
`tools/clean-container-check.sh stage-1`. It must pass. Do not weaken the check."); *Runtime limits*
("Starts and answers `/healthz` within **5 seconds**, 512 MB memory ceiling").

---

## S1-09 — Web UI: accounts list and create, with loading / empty / error states

**Stage:** 1  **Owner:** Builder  **Status:** planned
**Depends on:** S1-03

### Goal
`GET /` serves a server-rendered page from the same process, with plain CSS and vanilla JS, that
lists accounts with balances formatted as currency for display and lets a person create an account —
with explicit loading, empty and error states.

### Acceptance criteria
1. `GET /` returns `200` with `Content-Type: text/html`, and every asset it references is served by
   the same process with no external URL of any kind — checked by:
   `python -m unittest tests.test_ui_assets.SelfContainedTest -v`, which fetches the page, extracts
   every `src`, `href` and `url(...)`, and asserts all are same-origin relative paths
2. The accounts list shows each account's name and its balance formatted as currency (assumption A4),
   while the value received from the API is an integer — checked by:
   `python -m unittest tests.test_ui_assets.CurrencyFormatTest -v`, which asserts the formatter maps
   `123456 -> "$1,234.56"`, `0 -> "$0.00"`, `5 -> "$0.05"`, `-1 -> "-$0.01"` and uses no float
   operation (source scan for `/`, `parseFloat`, `Number.prototype.toFixed` on money)
3. An **empty** state is shown when there are no accounts — a visible message, not a blank area —
   checked by: `node ../tools/viewport-check.mjs http://127.0.0.1:8080/ evidence/ui-empty` against an
   empty database, plus `python -m unittest tests.test_ui_assets.EmptyStateTest -v`
4. A **loading** state is shown while a fetch is in flight — checked by:
   `python -m unittest tests.test_ui_assets.LoadingStateTest -v`, run against a deliberately delayed
   endpoint
5. An **error** state is shown when a request fails, carrying a human sentence rather than a status
   code — checked by: `python -m unittest tests.test_ui_assets.ErrorStateTest -v`
6. Creating an account through the form adds it to the list without a full page reload, and a `422`
   from the server is rendered next to the offending field as a human message — checked by:
   `python -m unittest tests.test_ui_assets.CreateFlowTest -v`
7. The page loads with **no console errors and no console warnings** — checked by:
   `node ../tools/viewport-check.mjs http://127.0.0.1:8080/ evidence/` with exit code `0`

### Invariants touched
> "**I5 — No floats in the money path.**" — task, *Invariants*. Criterion 2 confines formatting to
> display and forbids float arithmetic in the client's money handling.

### Out of scope
The transfer form and the history view (S1-10); responsive and keyboard work (S1-11). Visual polish
beyond the stated states is not reviewed.

### Source in the task
*Required interface* ("List accounts with balances, formatted as currency for display only (integers
in the data path)", "Create an account", "Explicit **loading, empty and error** states"); *Required
stack* ("server-rendered HTML plus plain CSS and vanilla JS served by the same process — no bundler,
nothing to install").

---

## S1-10 — Web UI: transfer form with a fresh idempotency key, and account history

**Stage:** 1  **Owner:** Builder  **Status:** planned
**Depends on:** S1-05, S1-07, S1-09

### Goal
A person can pick a source and a destination, enter an amount, submit a transfer that carries a fresh
client-generated idempotency key, read a clear human message when funds are insufficient, and see the
transfer history for a selected account.

### Acceptance criteria
1. The form lets the user pick source and destination from the existing accounts and enter an amount;
   submitting sends `POST /transfers` with an integer `amount` in minor units — checked by:
   `python -m unittest tests.test_ui_transfer.SubmitShapeTest -v`, which asserts the captured request
   body re-parses with a raising `parse_float` hook
2. Each submission carries a **fresh** `Idempotency-Key` generated client-side; two submissions
   produce two different keys, and a key is not reused after a failed attempt is corrected and
   resubmitted — checked by: `python -m unittest tests.test_ui_transfer.FreshKeyTest -v`
3. A double-click or double-submit of one unchanged form does **not** produce two transfers: the
   in-flight submission is disabled and its key is reused for a retry of the same submission —
   checked by: `python -m unittest tests.test_ui_transfer.DoubleSubmitTest -v`
4. A `409 insufficient_funds` renders as a clear human sentence naming the shortfall — never the
   string `409`, never `insufficient_funds` raw — checked by:
   `python -m unittest tests.test_ui_transfer.InsufficientFundsMessageTest -v`
5. Each of `422 invalid_request`, `404 not_found` and `409 idempotency_key_reused` renders its own
   human message — checked by: `python -m unittest tests.test_ui_transfer.ErrorMessagesTest -v`
6. Selecting an account shows its transfer history, newest first, with direction (in or out) visible
   and amounts formatted as currency — checked by:
   `python -m unittest tests.test_ui_transfer.HistoryTest -v`
7. The history has its own empty, loading and error states — checked by:
   `python -m unittest tests.test_ui_transfer.HistoryStatesTest -v`
8. After a successful transfer both balances and the history update without a full page reload —
   checked by: `python -m unittest tests.test_ui_transfer.RefreshTest -v`
9. Selecting the same account as source and destination is prevented in the form, and the server's
   `422` is still handled if it happens — checked by:
   `python -m unittest tests.test_ui_transfer.SameAccountTest -v`

### Invariants touched
> "**I3 — Idempotency.**" — task, *Invariants*. Criteria 2 and 3 are the client half: a fresh key per
> submission, and no accidental second movement from a double-click.

### Out of scope
Responsive layout, keyboard operation and focus states (S1-11).

### Source in the task
*Required interface* ("Make a transfer: pick source and destination, enter an amount, submit. Generate
a fresh idempotency key per submission client-side.", "Show a transfer history for a selected
account.", "A `409 insufficient_funds` must read as a clear human message, not a raw status code.").

---

## S1-11 — Interface quality: 375px and desktop, keyboard, focus, zero console errors

**Stage:** 1  **Owner:** Builder  **Status:** planned
**Depends on:** S1-10

### Goal
The finished interface works at phone and desktop width, is fully operable from the keyboard with
visible focus, produces no console errors or warnings, and its evidence is committed.

### Acceptance criteria
1. `node ../tools/viewport-check.mjs http://127.0.0.1:8080/ evidence/` exits `0`, reporting no
   console errors, no page errors, no failed requests and **no horizontal overflow** at either width
   — checked by that command; `evidence/viewport-report.json` is committed
2. `evidence/viewport-phone.png` (375px) and `evidence/viewport-desktop.png` (1280px) are committed
   and show the accounts list, the create form and the transfer form usable at that width — checked
   by: the same command, plus `python -m unittest tests.test_ui_quality.ScreenshotsPresentTest -v`
3. The check also passes on the transfer-history view and on a visible error state, so the states are
   evidenced, not just the happy path — checked by:
   `node ../tools/viewport-check.mjs http://127.0.0.1:8080/?account=<id> evidence/history` and
   `node ../tools/viewport-check.mjs http://127.0.0.1:8080/?demo=error evidence/error`, both exit `0`
4. Every interactive control is reachable and operable by keyboard alone, in a sensible tab order,
   and the full create-account and transfer flows can be completed without a pointer — checked by:
   `python -m unittest tests.test_ui_quality.KeyboardFlowTest -v`
5. Every focusable element has a **visible** focus indicator that is not `outline: none` without a
   replacement — checked by: `python -m unittest tests.test_ui_quality.FocusVisibleTest -v`, which
   scans the CSS and asserts a `:focus-visible` rule with a visible outline or ring for each control
   type
6. Form controls have associated labels, and the error and loading regions are announced (`role` /
   `aria-live`) — checked by: `python -m unittest tests.test_ui_quality.LabelsAndLiveRegionsTest -v`
7. **No console warnings either**, not only errors — checked by:
   `python -m unittest tests.test_ui_quality.NoConsoleWarningsTest -v`, which asserts the `warning`
   count in `evidence/viewport-report.json` is zero

### Invariants touched
None directly.

### Out of scope
Visual design beyond legibility and the stated states. Screen-reader testing beyond labels and live
regions, which the task does not require.

### Source in the task
*Required interface* ("Works at **375px** and at desktop width. Fully keyboard operable, visible focus
states.", "**No console errors or warnings.** Verified with `tools/viewport-check.mjs`; save
screenshots at both widths under `stage-1/evidence/`").

---

## S1-12 — Attack suite and invariant evidence (race, replay, conservation)

**Stage:** 1  **Owner:** Breaker  **Status:** planned
**Depends on:** S1-06, S1-08

### Goal
An independent attack for **every** invariant the task states, run at or above the stated load,
against the assembled service, with the evidence the task names committed under `stage-1/evidence/`.

### Acceptance criteria
1. **I1** — `evidence/race.jsonl` from `python ../tools/race.py --template <breaker template>
   --workers 50 --rounds 5 --out evidence/race.jsonl` exists, and a committed conservation check
   proves the sum of all balances before equals the sum after, exactly, in integer minor units —
   checked by: `python -m unittest tests.test_attack_conservation -v`, which reads `race.jsonl` and
   the database and fails on any discrepancy
2. **I2** — no account balance is negative at any observed instant: a sampler polls `GET /accounts`
   throughout the race and the check fails on any negative value; plus a direct SQL attempt to drive a
   balance negative raises — checked by: `python -m unittest tests.test_attack_negative -v`
3. **I3** — `evidence/replay.jsonl` from `python ../tools/replay.py --template <breaker template>
   --count 20 --parallel --key-header Idempotency-Key --out evidence/replay.jsonl` proves every
   response carried the same transfer `id` and that money moved exactly once — checked by:
   `python -m unittest tests.test_attack_replay -v`
4. **I4** — after every attack, each account's opening balance plus the sum of its ledger entries
   equals its balance, every completed transfer has exactly two entries summing to zero, and no
   transfer row exists without its pair — checked by:
   `python -m unittest tests.test_attack_double_entry -v`
5. **I5** — a float, a numeric string, `1e2`, `true`, `NaN`, `Infinity`, a very large exponent and a
   number with a trailing `.0` are each rejected `422` on both `POST /accounts` and `POST /transfers`,
   and every successful response body re-parses with a raising `parse_float` hook — checked by:
   `python -m unittest tests.test_attack_no_floats -v`
6. **Load floor** — the race ran at **or above** 50×5 and the replay at **or above** 20 simultaneous;
   the counts are asserted from the evidence files themselves, not from the command line — checked by:
   `python -m unittest tests.test_attack_load_floor -v`
7. **No `500`, no partial write** — no response in `race.jsonl` or `replay.jsonl` has a status of
   `500` or a transport failure, and every `409 insufficient_funds` left zero rows behind — checked
   by: `python -m unittest tests.test_attack_no_500 -v`
8. Every attack is committed under `stage-1/tests/` and is discovered by the one full-suite command,
   and every attack the Breaker wrote is derived from the task text, not copied from the Builder's
   tests — checked by: `python -m unittest discover -s tests -t . -v` and the Breaker's packet

### Invariants touched
All of I1, I2, I3, I4, I5, plus the *Required concurrency behaviour* and both *Runtime limits* loads.

### Out of scope
Fixing any defect found: a failure is a rejection back to the Builder
(`factory/protocols/rejection.md`). The Breaker commits test and evidence code only.

### Source in the task
*Invariants* (all), *Required concurrency behaviour*, *Runtime limits*, *Evidence required under
`stage-1/evidence/`* (`race.jsonl` + the conservation check, `replay.jsonl`).

---

## S1-13 — Independent acceptance suite from the task text

**Stage:** 1  **Owner:** Verifier  **Status:** planned
**Depends on:** S1-07, S1-11

### Goal
A suite derived independently from the interface contract — not from the Builder's tests — that
proves every stated status, body and ordering, plus the offline container check and the viewport
check on the assembled stage.

### Acceptance criteria
1. Every row of the interface contract has at least one check written from the task text: `/healthz`;
   `POST /accounts` `201` and `422`; `GET /accounts` `200` and ordering; `GET /accounts/{id}` `200`
   and `404`; `POST /transfers` `201`, `422`, `404`, `409 insufficient_funds`, `400
   missing_idempotency_key`, `409 idempotency_key_reused`; `GET /transfers/{id}` `200` and `404`;
   `GET /transfers?account_id=` `200` and ordering — checked by:
   `python -m unittest discover -s tests -p 'test_acceptance_*.py' -t . -v`, with a coverage assertion
   in `tests/test_acceptance_contract_coverage.py` that fails if any contract row has no check
2. Every error body matches the exact shape the task prints, including the `detail` key on
   `invalid_request` — checked by: `python -m unittest tests.test_acceptance_error_shapes -v`
3. `tools/clean-container-check.sh stage-1 --health-path /healthz --port 8080` passes on the reviewed
   commit, and `git diff --exit-code -- tools/` is clean, proving the check was not weakened — checked
   by both commands
4. `node ../tools/viewport-check.mjs http://127.0.0.1:8080/ evidence/` exits `0` on the reviewed
   commit at both widths — checked by that command
5. The full suite is green on the reviewed commit — checked by:
   `python -m unittest discover -s tests -t . -v`
6. At least one check in the suite was written by the Verifier from the task text and is not a copy of
   a Builder test, as required by the definition of done — checked by: the Verifier's sign-off naming
   the file and the task sentence it came from

### Invariants touched
All, indirectly: the suite is the contract-level net under the Breaker's attacks.

### Out of scope
Product fixes. The Verifier commits acceptance tests and evidence only
(`factory/protocols/git.md`).

### Source in the task
*Interface contract* (every row), *Offline container rules*, *Required interface*, *Definition of
done* ("both reviewers sign off on the reviewed commit").

---

## S1-14 — Stage assembly, green full suite, evidence index, release note

**Stage:** 1  **Owner:** Integrator  **Status:** planned
**Depends on:** S1-12, S1-13

### Goal
The stage is assembled from accepted work only, every required piece of evidence is present under
`stage-1/evidence/`, and the stage outcome is posted to the room.

### Acceptance criteria
1. `stage-1/evidence/` contains all five required artifacts: `race.jsonl` with its conservation
   check, `replay.jsonl`, `container-check.log`, viewport screenshots at 375px and desktop, and the
   full suite output — checked by: `python -m unittest tests.test_evidence_index -v`, which asserts
   each path exists and is non-empty
2. The full suite is green on the **final** commit, and its unedited output is committed at
   `stage-1/evidence/full-suite.txt` — checked by:
   `python -m unittest discover -s tests -t . -v | tee evidence/full-suite.txt`
3. `tools/clean-container-check.sh stage-1 --health-path /healthz --port 8080` passes on the final
   commit — checked by that command, with its log committed
4. Nothing outside `stage-1/` is modified — checked by:
   `git diff --stat <dispatch-commit>..HEAD -- . ':(exclude)stage-1'` producing no output
5. `stage-1/ASSUMPTIONS.md` contains every assumption any seat made during the stage — checked by:
   cross-reading the room's assumption announcements against the file, listed in the release note
6. `stage-1/RELEASE.md` records what was built, every assumption, every rescoped item with its
   reason, and the stage outcome — checked by: the file's presence and the Integrator's room post
7. Every board item is `accepted` or `rescoped` with a reason — checked by:
   `band work board <chat-id>`

### Invariants touched
None directly.

### Out of scope
Declaring the stage done is the Integrator's alone; the Planner does not declare it
(`factory/mandates/planner.md`).

### Source in the task
*Definition of done* ("the Integrator posts the release note and stage outcome to the room"),
*Evidence required under `stage-1/evidence/`*.

---

## Coverage list

Every requirement in the task, mapped to the work item that satisfies it. Nothing in the task is
unmapped.

### Required stack
| Task requirement | Item |
|---|---|
| Python 3.11 standard library only, no pip / npm / build step | S1-01, S1-08 |
| SQLite as the store | S1-02 |
| Serve HTTP with `http.server` / `socketserver` | S1-01 |
| `isolation_level=None`, explicit transactions | S1-02, S1-04 |
| Server-rendered HTML + plain CSS + vanilla JS from the same process | S1-09 |

### Interface contract
| Task requirement | Item |
|---|---|
| `GET /healthz` → `200 {"status":"ok"}`, within 1s of start | S1-01 |
| `POST /accounts` `201` | S1-03 |
| `POST /accounts` `422 invalid_request` (name, opening_balance) | S1-03 |
| `GET /accounts` `200`, ordered by creation time | S1-03 |
| `GET /accounts/{id}` `200` / `404` | S1-03 |
| `POST /transfers` `201 completed` with ISO 8601 `created_at` | S1-04 |
| `POST /transfers` `422 invalid_request` | S1-04 |
| `POST /transfers` `404 not_found` | S1-04 |
| `POST /transfers` `409 insufficient_funds`, nothing written | S1-04 |
| `Idempotency-Key` required; `400 missing_idempotency_key` | S1-05 |
| `409 idempotency_key_reused` on same key, different body | S1-05 |
| `GET /transfers/{id}` `200` / `404` | S1-04 |
| `GET /transfers?account_id=` `200`, newest first, source or destination | S1-07 |
| All bodies JSON, `Content-Type: application/json` | S1-01, S1-03, S1-04 |
| All amounts integers in minor units; non-integer rejected | S1-01, S1-03, S1-04 |

### Invariants
| Task requirement | Built by | Attacked by |
|---|---|---|
| I1 — Conservation | S1-04, S1-06 | S1-12 |
| I2 — No negative balance (`CHECK`, not only application) | S1-02, S1-04 | S1-12 |
| I3 — Idempotency, incl. simultaneous replays | S1-05 | S1-12 |
| I4 — Double entry in the same transaction | S1-02, S1-04 | S1-12 |
| I5 — No floats in the money path | S1-01, S1-09 | S1-12 |
| Serialize writes; `BEGIN IMMEDIATE` + `UPDATE ... WHERE balance >= ?`; WAL; no lost update; never `500`, never partial | S1-02, S1-06 | S1-12 |

### Runtime limits
| Task requirement | Item |
|---|---|
| One container, one process, no external services, SQLite file inside | S1-08 |
| `/healthz` within 5 seconds of start | S1-08 |
| 512 MB memory ceiling | S1-08 |
| 50 concurrent × 5 rounds, only `409 insufficient_funds` as error | S1-06, S1-12 |
| 20 simultaneous replays, exactly one money movement | S1-05, S1-12 |

### Offline container rules
| Task requirement | Item |
|---|---|
| Pinned base image, no network during build | S1-08 |
| `docker run --network none` starts and passes the health check | S1-08 |
| `tools/clean-container-check.sh stage-1` passes, unweakened | S1-08, S1-13 |

### Required interface
| Task requirement | Item |
|---|---|
| List accounts with balances, currency for display only | S1-09 |
| Create an account | S1-09 |
| Make a transfer; fresh client-side idempotency key per submission | S1-10 |
| Transfer history for a selected account | S1-10 |
| Explicit loading, empty and error states | S1-09, S1-10 |
| `409 insufficient_funds` as a clear human message | S1-10 |
| Works at 375px and desktop | S1-11 |
| Fully keyboard operable, visible focus states | S1-11 |
| No console errors or warnings, verified with `tools/viewport-check.mjs` | S1-11 |
| Screenshots at both widths under `stage-1/evidence/` | S1-11 |

### Definition of done and evidence
| Task requirement | Item |
|---|---|
| Both reviewers sign off on the reviewed commit | per item, closed out by S1-13 |
| Breaker attacks every invariant at or above stated load | S1-12 |
| Offline container check passes | S1-08, S1-13 |
| UI verified at both widths | S1-11, S1-13 |
| Assumptions recorded | `stage-1/ASSUMPTIONS.md`, closed out by S1-14 |
| Integrator posts release note and stage outcome | S1-14 |
| `evidence/race.jsonl` + conservation check | S1-12 |
| `evidence/replay.jsonl` | S1-12 |
| `evidence/container-check.log` | S1-08 |
| Viewport screenshots | S1-11 |
| Full test suite output, green, on the final commit | S1-14 |

---

## Notes for the seats

- **Builder** — claim S1-01 and S1-02 first; they have no dependencies and can be built in either
  order. An item whose criteria you cannot check with a command is a rejection back to the Planner,
  not a guess (`factory/protocols/workflow.md`, step 3).
- **Verifier** and **Breaker** — start deriving checks from `tasks/stage-1.task.md` now, in parallel
  with the build. S1-12 and S1-13 are the committed home for that work, but neither waits for its
  board item to become ready before writing checks.
- **Every seat** — an ambiguity is resolved by `factory/protocols/autonomy.md`: choose the
  conservative reading, append it to `stage-1/ASSUMPTIONS.md`, announce it @mentioning the Planner,
  and proceed. Never wait.
- A work item may be rejected at most three times. On the third, the Planner splits, narrows or
  rescopes it before anything more is built.
