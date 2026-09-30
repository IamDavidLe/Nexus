# Stage 1 — Attack plan (Breaker)

Board item **S1-12** (`#13`). Written from `tasks/stage-1.task.md` before any product code exists,
per `factory/protocols/workflow.md` step 2 and the Planner's working agreement.

Every target below is **quoted from the task**. Nothing here is invented, and nothing here is a
taste judgement. An invariant is recorded **held** only when every applicable attack on it passed at
or above the load the task states, checked against **stored state**, not against responses.

- Attacks live in `stage-1/tests/test_attack_*.py`, discovered by the one full-suite command
  (`python -m unittest discover -s tests -t . -v`, run from inside `stage-1/`, per Planner A12).
- Shared machinery lives in `stage-1/tests/attack/`.
- Evidence lands in `stage-1/evidence/` (`race.jsonl`, `replay.jsonl`) and
  `stage-1/evidence/S1-12/` (per-run logs, DB snapshots, the templates actually used).
- Breaker assumptions: `stage-1/tests/attack/ASSUMPTIONS-BREAKER.md` (B1–B8), announced in the room
  @mentioning the Planner.

## Attack classes applied

Per `factory/mandates/breaker.md`: **concurrency**, **replays and retries**, **boundaries**,
**precision**, **time**. Each invariant section names which classes apply and why any class does not.

## Stated loads (floors, never below)

| Load | Task wording | Where asserted |
|---|---|---|
| 50 x 5 | "Survives **50 concurrent requests x 5 rounds** against a single source account" | `test_attack_load_floor` counts workers and rounds out of `race.jsonl` itself |
| 20 simultaneous | "Survives **20 simultaneous replays** of one idempotency key" | `test_attack_load_floor` counts lines in `replay.jsonl` and asserts they were parallel |
| 5 s start | "Starts and answers `/healthz` within **5 seconds**" | timing attack R-b (see B6 — the container check alone does not prove it) |
| 1 s health | "Must answer within 1s of container start" | R-c (see B6) |
| 512 MB | "512 MB memory ceiling" | container check default `--memory 512m`, unweakened |

Assumption **B2**: "at or above" is met by running the race **3 independent times** at 50x5 and the
replay **3 independent times** at 20 parallel. One passing run does not clear a timing invariant. All
runs are kept: `race.jsonl` / `replay.jsonl` hold the last run, `evidence/S1-12/run-N/` holds each.

---

## I1 — Conservation

> "The sum of all account balances is unchanged by any number of transfers, concurrent or
> sequential, successful or rejected. Sum before = sum after, exactly, in integer minor units.
> There is no external money movement in this stage; every cent enters only through
> `opening_balance` at account creation."

The quantity that must stay constant is `SELECT SUM(balance) FROM accounts`. It is computed
**before and after every single attack run in this plan**, not only the race.

| # | Class | Attack | Decides pass/fail |
|---|---|---|---|
| I1-a | concurrency | 50 workers x 5 rounds, all transferring from **one** source to many destinations, released on a barrier: `python ../tools/race.py --template evidence/S1-12/race-template.json --workers 50 --rounds 5 --out evidence/race.jsonl` | `SUM(balance)` identical before/after, read from SQLite |
| I1-b | concurrency | Same load, **cycle** topology: A to B, B to C, C to A simultaneously, so every account is source and destination at once | `SUM(balance)` identical; no balance derived from a stale read |
| I1-c | concurrency | Same load where **every** transfer must fail `409 insufficient_funds` (source opening balance 0) — the "or rejected" half | `SUM(balance)` identical **and** zero ledger rows written |
| I1-d | replays/retries | 20 parallel replays of one key mixed into a 50x5 race | `SUM(balance)` identical; destination delta equals exactly one `amount` |
| I1-e | boundaries | Transfer of the full source balance, leaving exactly 0; then one more cent | first `201` leaving balance 0, second `409`; `SUM(balance)` identical |
| I1-f | precision | Amount `1` (smallest unit); amount `2**63 - 1`; an amount that does not divide evenly across three legs (100 split 33/33/34) | no cent created or lost by rounding; `SUM(balance)` exact |
| I1-g | boundaries | A `409`, a `404`, a `422` and a `400 missing_idempotency_key` each interleaved into the race | every rejected request writes nothing; `SUM(balance)` identical |

Checked by `python -m unittest tests.test_attack_conservation -v`, which reads `race.jsonl` **and**
the database. Time class: not applicable, conservation has no time dimension.

---

## I2 — No negative balance

> "No account balance is ever negative, at any instant, under any interleaving. Enforce with a
> `CHECK (balance >= 0)` constraint, not only an application check."

| # | Class | Attack | Decides pass/fail |
|---|---|---|---|
| I2-a | concurrency | 50 x 5 against a single source holding **less than** the round would move, so most requests must be refused | `SELECT MIN(balance) FROM accounts` never below 0 after any round |
| I2-b | concurrency | A sampler thread polls `GET /accounts` continuously through the whole race — the "at any instant" half | no negative balance in any sample; samples saved to `evidence/S1-12/balance-samples.jsonl` |
| I2-c | boundaries | Source balance exactly equal to amount; then amount one greater | `201` then `409`; never a negative row |
| I2-d | storage layer | Direct SQL against the committed DB: `UPDATE accounts SET balance = -1 WHERE id = ?` | must raise `sqlite3.IntegrityError`. This is the **only** proof the constraint is not "only an application check"; a successful update is a rejection of I2 no matter how the API behaves |
| I2-e | storage layer | `PRAGMA integrity_check`, and `CHECK (balance >= 0)` present in the `accounts` DDL in `sqlite_master` | both required |
| I2-f | precision | Amount `2**63 - 1` from an account with a small balance | `409`, no wraparound to a positive balance |

Checked by `python -m unittest tests.test_attack_negative -v`. Replays/retries and time are covered
by I2-a mixed load; no independent failure mode.

---

## I3 — Idempotency

> "Replaying a `POST /transfers` with the same `Idempotency-Key` and the same body returns the same
> response with the same transfer `id`, and moves money **exactly once** — including when the
> replays arrive simultaneously."

Stated load: **20 simultaneous replays with exactly one money movement.**

| # | Class | Attack | Decides pass/fail |
|---|---|---|---|
| I3-a | replays/retries | `python ../tools/replay.py --template evidence/S1-12/replay-template.json --count 20 --parallel --key-header Idempotency-Key --out evidence/replay.jsonl` | all 20 responses carry the **same** transfer `id`; exactly **one** transfer row and **two** ledger entries exist for that key. Per **B7** a mix of `201` and `409 idempotency_key_reused` on an identical body is a **failure**, not a pass |
| I3-b | replays/retries | Same template, `--count 20` **sequential** — a retry after the first has committed | identical status and body every time; still one money movement |
| I3-c | replays/retries | Replay **after a timeout**: send with a 1 ms client timeout so the client abandons the request, then replay the same key to completion | exactly one money movement; the abandoned attempt did not double-apply. 20 runs (B2) |
| I3-d | replays/retries | Bare repeat with **no** key header | `400 missing_idempotency_key` every time, nothing written |
| I3-e | replays/retries | Same key, **different** body (amount changed by 1) | `409 idempotency_key_reused`; the original transfer unchanged; nothing new written |
| I3-f | replays/retries | Same key, same values, **reordered JSON keys plus added whitespace** | a replay (same id), per Planner A7 — the stricter reading of "the same body" |
| I3-g | boundaries | Key length 1, 128, 129, empty, whitespace-only, absent, 8 KB, and a key containing a newline, a NUL and non-ASCII | 1 and 128 accepted; empty/absent give `400 missing_idempotency_key`; 129 and oversized are rejected, never `500`, never a partial write |
| I3-h | concurrency | 50 x 5 where **all 250** requests share **one** key | exactly one transfer row, exactly two ledger entries, one `amount` moved |
| I3-i | concurrency | 20 parallel replays of key K interleaved with 20 parallel replays of key K2 on the same source | two transfer rows, two money movements, no cross-contamination of ids |
| I3-j | time | Replays spread across a 5 s window while other traffic commits between them | still one money movement; the replayed response still matches the original |

Checked by `python -m unittest tests.test_attack_replay -v`.

---

## I4 — Double entry

> "Every completed transfer writes exactly two ledger entries, one negative and one positive,
> summing to zero, committed in the **same database transaction** as the balance updates. For every
> account, the sum of its entries plus its opening balance equals its current balance."

Re-checked **after every attack run in this plan**, against stored state only.

| # | Class | Attack | Decides pass/fail |
|---|---|---|---|
| I4-a | stored state | For every transfer with `status = completed`: exactly 2 entries, one negative, one positive, `SUM = 0`, magnitudes equal to `amount` | any other count or sum is a failure |
| I4-b | stored state | For every account: `opening_balance + SUM(entries) = balance` | exact integer equality |
| I4-c | stored state | No ledger entry whose transfer id has no transfer row; no completed transfer with 0 or 1 entries — "no transfer row exists without its pair" | an orphan on either side is a failure |
| I4-d | concurrency | Run I4-a..c after the 50 x 5 race and after each replay run | a torn write shows up here even when every response was `201` |
| I4-e | atomicity | Kill the process (`SIGKILL`) mid-race, restart, re-run I4-a..c and I1 | no half-applied transfer: "the same database transaction" means a crash cannot leave one leg |
| I4-f | atomicity | Same, immediately after a `409 insufficient_funds` burst | zero rows from refused transfers survive the restart |
| I4-g | boundaries | A transfer whose source equals destination | `422 invalid_request`, and **no** entries at all — not two cancelling ones |

Checked by `python -m unittest tests.test_attack_double_entry -v`.

---

## I5 — No floats in the money path

> "No `float`, no `Decimal`-to-float conversion, no JSON parse that yields a float for an amount,
> anywhere between request parsing and storage. Reject `1.5`, `"10"`, `1e2` and `true` as amounts."

| # | Class | Attack | Decides pass/fail |
|---|---|---|---|
| I5-a | precision | The four the task names — `1.5`, `"10"`, `1e2`, `true` — on `amount` **and** on `opening_balance` | `422 invalid_request` each, nothing written |
| I5-b | precision | `1.0`, `-0.0`, `2.0e3`, `0.1`, `1E2`, `1e+2`, `100.`, `.5` | `422`. A trailing `.0` is a float in JSON and must not be coerced to an int |
| I5-c | precision | `NaN`, `Infinity`, `-Infinity` — the Python `json` module accepts these, strict JSON does not | `422`, never `500` |
| I5-d | precision | `1e400` (parses to `inf`) and `10**400` as a bare integer literal | `422`, never `500`, never stored |
| I5-e | boundaries | `opening_balance`: `-1`, `0`, missing, `null`, `[]`, `{}`, `"0"`. `amount`: `0`, `-1`, `1`, missing, `null` | `0` accepted for `opening_balance`, rejected for `amount` (stated `>= 1`); every non-integer `422` |
| I5-f | boundaries | `amount` of `2**63 - 1`, `2**63`, `-2**63`, `2**64` (Planner A11: absolute value at or above `2**63` is `422`) | at or past the 64-bit edge is `422`, never a silently truncated or inexact stored value |
| I5-g | precision | Every **successful** response body re-parsed with `json.loads(..., parse_float=<raises>)` | no float in any money field of any response |
| I5-h | stored state | `typeof(balance)`, `typeof(opening_balance)`, `typeof(amount)` for every row | must be `integer` for every row — SQLite is dynamically typed, so a float can sit in an `INTEGER` column |
| I5-i | precision | Amounts `1`, `99`, `100`, `101`, `999999999999` round-tripped and re-read | identical integers out; nothing created or lost by rounding |
| I5-j | boundaries | Malformed input: empty body, `null`, a JSON array, a bare string, truncated JSON, a 1 MB body, wrong `Content-Type`, duplicate `amount` keys, deeply nested JSON | `422` (or `400` for the missing key), never `500`, never a partial write |
| I5-k | precision | The UI display path for `1`, `99`, `100`, `1234567` (Planner A4, integer division only) | a display-only formatted string is never fed back into a request |

Checked by `python -m unittest tests.test_attack_no_floats -v`. Concurrency is not a separate class
here — a rejection is a rejection at any load — but I5-a is re-run **inside** the race via I1-g so a
validator cannot be skipped under load.

---

## Required concurrency behaviour

> "Serialize writes against the source account so two concurrent transfers cannot both read the same
> balance and both succeed. `BEGIN IMMEDIATE` plus a single `UPDATE ... WHERE balance >= ?` guarded
> by the `CHECK` constraint is sufficient; a lost update is a defect. Enable WAL mode. Under
> contention a request must either succeed or return `409 insufficient_funds` — never `500`, never a
> partial write."

| # | Class | Attack | Decides pass/fail |
|---|---|---|---|
| C-a | concurrency | 50 x 5, single source with a balance that funds exactly **N** of the 250 requests | **exactly N** `201`s and **exactly 250 - N** `409 insufficient_funds`. N+1 successes is the lost update the task calls a defect |
| C-b | concurrency | Same, over 3 runs (B2) | zero `500`s, zero transport failures, and **no status other than** `201` and `409` — "no error other than `409 insufficient_funds`" |
| C-c | stored state | `PRAGMA journal_mode` on the live DB | must read `wal` |
| C-d | concurrency | A competing writer holding a write transaction open, so `SQLITE_BUSY` is certain | still `201` or `409`, never `500`. A bare `sqlite3.OperationalError` reaching the client is a failure (Planner A13) |
| C-e | concurrency | Transfers in opposite directions between the same pair, 50 x 5 | no deadlock, no `500`, conservation exact |
| C-f | boundaries | The same attack **above** the floor as well (100 x 5) to confirm the floor is not a cliff | same criteria, recorded separately. A failure **only** above the stated floor is reported as a note, never as a sign-off blocker |
| C-g | time | Ordering of near-simultaneous events: 50 simultaneous transfers touching one account, then `GET /transfers?account_id=` | strictly newest-first, no duplicate, no dropped row; ties broken deterministically rather than by an equal `created_at` string (Planner A5) |
| C-h | time | 50 simultaneous `POST /accounts`, then `GET /accounts` | "ordered by creation time" holds with no duplicates and no omissions |

Checked by `python -m unittest tests.test_attack_no_500 -v` plus `tests.test_attack_conservation -v`.

Calendar boundaries (day, month, year, time zones) are **not attacked**: the task exposes no date
input and no date-bounded behaviour, so there is no stated invariant to break there. Recorded as
**B5** rather than silently dropped.

---

## Runtime limits and the offline container

> "Starts and answers `/healthz` within **5 seconds**, 512 MB memory ceiling." ·
> "`docker run --network none` must start the service and pass the health check." ·
> "The check is `tools/clean-container-check.sh stage-1`. It must pass. Do not weaken the check."

| # | Class | Attack | Decides pass/fail |
|---|---|---|---|
| R-a | — | `tools/clean-container-check.sh stage-1 --health-path /healthz --port 8080` with **no** `--allow-build-network` and the default `--memory 512m --cpus 1` | exit 0. Passing only with `--allow-build-network`, a raised memory cap or a raised `--timeout` is a **rejection**: that is weakening the check |
| R-b | boundaries | A Breaker-owned timing attack: `docker run --network none` the built image and stamp the first successful `/healthz`, 3 runs (B2, B6) | every run healthy inside the **5 s the task states**, not the tool's 60 s default tolerance |
| R-c | boundaries | `/healthz` response time, 100 sequential and 50 concurrent | every response under **1 s** and exactly `{"status":"ok"}` (B6) |
| R-d | — | Run the 50 x 5 race **inside** the 512 MB / 1 CPU container, not only against a host process | no `500`, no OOM kill, conservation exact under the stated cap |
| R-e | boundaries | Confirm the running container has no route out under `--network none` | a service that needs egress fails here |
| R-f | — | "One container, one process, no external services": process count inside the container | a second process, or an external dependency, is a failure |
| R-g | boundaries | Restart the container against an existing `/data/app.db` (Planner A3) | no wipe, and I1 + I4 still hold across the restart |

Checked by `python -m unittest tests.test_attack_runtime_limits -v`.

---

## Interface requirements (stated, therefore attacked)

> "No console errors or warnings." · "Works at **375px** and at desktop width. Fully keyboard
> operable, visible focus states." · "Generate a fresh idempotency key per submission client-side."
> · "A `409 insufficient_funds` must read as a clear human message, not a raw status code."

| # | Class | Attack | Decides pass/fail |
|---|---|---|---|
| U-a | — | `node ../tools/viewport-check.mjs http://127.0.0.1:8080/ evidence/` | exit 0 at both widths: zero console errors, zero page errors, zero overflow |
| U-b | — | A Breaker-owned console capture recording **`warning`** as well as `error` (B1: `tools/viewport-check.mjs:55` filters `m.type() === "error"` and its gate at line 70 never reads warnings, so the named tool cannot prove the stated "or warnings" half) | zero warnings at 375px and desktop, across every interaction below |
| U-c | replays/retries | Submit the same transfer form twice without reloading, and double-click submit | two distinct client keys giving two transfers, **or** one guarded submission — but never one key reused for two different amounts, and never `409 idempotency_key_reused` shown to a user who changed the amount |
| U-d | boundaries | Drive the transfer form with an insufficient amount | a human-readable message, with no raw `409` and no status code in the visible text |
| U-e | boundaries | Empty account list, empty transfer history, and a server error injected by stopping the process mid-page | each of the stated loading / empty / error states appears |
| U-f | — | Keyboard only: tab to every control, submit by keyboard, confirm a visible focus ring on each | any control unreachable, or with no visible focus, is a failure |

Checked by `python -m unittest tests.test_attack_ui -v`, which skips with a stated reason when no
browser is available. A skip is never a sign-off.

---

## What a pass and a failure mean

- **Held** — every attack in that section ran, at or above the stated load, on the named commit, and
  passed, with the before/after stored-state numbers recorded in the evidence folder.
- **Not held** — one attack broke it. That is a rejection to the Builder per
  `factory/protocols/rejection.md`: the exact command, the invariant quoted from the task, observed
  versus expected **stored state**, the smallest reproduction, and for a timing failure how many runs
  out of how many failed. This seat touches no product code.
- **Skipped** is neither. The sign-off names the attacks that actually ran, and nothing else.
