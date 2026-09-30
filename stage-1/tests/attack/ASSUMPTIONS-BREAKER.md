# Stage 1 — Breaker assumptions (B1–B8)

Per `factory/protocols/autonomy.md`: the most conservative reading, recorded, announced in the room
@mentioning the Planner, then proceeded on. Nothing was asked of anyone.

These live here rather than in `stage-1/ASSUMPTIONS.md` because `factory/protocols/git.md` gives the
assumptions file to the Planner and tells every seat to stage only its own paths. Announced in the
room @mentioning the Planner so they can fold them into `ASSUMPTIONS.md` if they want one file.
Work item: **S1-12**.

Each entry: **question** · **choice** · **why** · **what changes if the choice is wrong**.

---

### B1 — "No console errors or warnings" cannot be proven by the tool the task names

**Question.** `tasks/stage-1.task.md` requires "No console errors **or warnings**. Verified with
`tools/viewport-check.mjs`". That tool subscribes only to `m.type() === "error"`
(`tools/viewport-check.mjs:55`) and its pass gate reads `consoleErrors`, `pageErrors` and
`overflowPx` only (line 70). It is structurally blind to warnings.

**Choice.** Run `tools/viewport-check.mjs` unmodified **and** add a Breaker-owned console capture
under `stage-1/tests/attack/` that records `warning` as well as `error`, and require **zero** of
both at 375px and desktop. `tools/` is not modified: no seat owns it in the `git.md` table, and the
task says do not weaken the check — replacing it would also be changing it.

**Why.** The stricter of the two readings. The alternative — treating a green `viewport-check.mjs`
as proof — would declare half a stated requirement held on evidence that cannot show it.

**If wrong.** The extra capture is deleted and nothing else moves. Independently reached by the
Integrator, who asks the Planner to state it as an S1-13 criterion; if it lands there instead, the
Breaker capture becomes a second, redundant check rather than the only one.

---

### B2 — "At or above the stated load" means repeated runs, not one

**Question.** The task states 50 concurrent x 5 rounds and 20 simultaneous replays, but not how many
times the attack itself is run. A concurrency defect can hide behind one lucky interleaving.

**Choice.** The race runs **3 independent times** at 50x5 (750 requests total) and the replay **3
independent times** at 20 parallel. Every run must pass. `evidence/race.jsonl` and
`evidence/replay.jsonl` hold the last run for the artifacts the task names; `evidence/S1-12/run-N/`
holds each run in full. An attack that passes 2 of 3 runs is a **failure** reported with the run
count, per `rejection.md` item 4.

**Why.** "At or above" is a floor, and `breaker.md` requires the attack "repeated several times".
One green run is not evidence a race is absent.

**If wrong.** Only the run count drops. No check logic changes.

---

### B3 — Invariants are decided against stored state, never against responses

**Question.** The task does not say where conservation and double entry are measured.

**Choice.** Every invariant verdict reads SQLite directly (`SUM(balance)`, ledger rows,
`typeof(...)`, `PRAGMA journal_mode`, the `accounts` DDL). Responses are recorded as evidence and
used to count statuses, never to decide that an invariant held.

**Why.** A service can answer `201` and still have written one leg. "Sum before = sum after" is a
statement about stored money.

**If wrong.** Nothing — this is strictly more evidence.

---

### B4 — Host-local run for the SQL-level attacks; the container run for the stated limits

**Question.** I2-d and I2-e need to open the database file; I4-e needs to kill the process. The DB
inside the container (`/data/app.db`, Planner A3) is not reachable from the host, and the task says
the service runs in a container.

**Choice.** Two targets. The stated **loads and limits** (R-a..R-g, and one full 50x5 race) are run
against the container exactly as the task says it runs. The **storage-layer** attacks are run
against the same commit started on the host with `PORT` and `DB_PATH` set to a temp file. The harness
takes `ATTACK_BASE_URL`, `ATTACK_DB_PATH` and `ATTACK_START_CMD` from the environment; with none set
it tries `stage-1/app.py`, `server.py`, `main.py`, `src/app.py`. If it cannot find or reach a
service it **skips with the reason printed** — it never silently passes.

**Why.** The constraint claim in I2 ("not only an application check") is unprovable without opening
the file. Running the loads in the container keeps the stated limits honest.

**If wrong.** The Builder names its start command in the handoff packet (or sets
`ATTACK_START_CMD`), and one env var changes.

---

### B5 — No calendar-boundary attacks, because the task states no calendar behaviour

**Question.** `breaker.md` lists time attacks — day, month and year boundaries and time zones —
"where the task involves time". The task's only time surfaces are `created_at` (ISO 8601) and
"newest first".

**Choice.** Attack the parts that exist: **ordering of near-simultaneous events** (C-g, C-h) and
replays spread over a window (I3-j). Do **not** attack day/month/year rollovers or zone conversion,
and do not claim to have.

**Why.** `breaker.md` forbids inventing invariants the task does not state. There is no stated
date-bounded behaviour to break, and manufacturing one would need product code this seat may not
touch.

**If wrong.** If a later stage adds date filtering, those attacks are added then.

---

### B6 — Both stated start deadlines are enforced, on the reading that makes them consistent

**Question.** The contract says `/healthz` "must answer within 1s of container start"; Runtime
limits say the service "starts and answers `/healthz` within **5 seconds**". Two different numbers
for what looks like one event. Separately, `clean-container-check.sh` polls in a `sleep 2` loop up to
a 60 s default and prints no elapsed time, so a pass means "healthy eventually".

**Choice.** Enforce both on the reading under which both are true: **5 s** is the budget from
`docker run` to the first successful health answer (R-b, timed by the Breaker, 3 runs), and **1 s**
is the budget for any single `/healthz` response once the process is listening (R-c, 100 sequential
and 50 concurrent). `--timeout` is **not** lowered on the shared check — each of its polls starts a
`busybox` probe container whose own startup would land inside a 5 s deadline and false-fail a
compliant service.

**Why.** The stricter reading of each number, and the only one that does not discard a stated limit.
Timing it separately keeps the shared check unweakened.

**If wrong.** The timing attack's threshold constant changes. Independently reached by the
Integrator, who asks the Planner to state it as an S1-13 criterion.

---

### B7 — Under simultaneous replay, a mixed 201/409 outcome is a failure

**Question.** I3 requires simultaneous replays to return "the same response with the same transfer
`id`". The contract also defines `409 idempotency_key_reused` for a **different** body. It is not
stated what a *concurrent* duplicate of an *identical* body may return.

**Choice.** All 20 simultaneous replays of an identical body must carry the **same status and the
same transfer `id`**. A response set mixing `201` with `409 idempotency_key_reused`, or carrying two
different ids, is a **failure** — even though money may have moved only once.

**Why.** The stricter reading of "returns the same response with the same transfer `id`", stated
without a concurrency exemption. The contract reserves `409 idempotency_key_reused` for a different
body, so emitting it for an identical one contradicts the contract as written.

**If wrong.** This becomes the one place the Breaker is stricter than the Builder's reading; it is
reported with the exact response set so the Planner can rule, and it is raised **before** sign-off
rather than after.

---

### B8 — "Moves money exactly once" is counted in the ledger, not in the balance

**Question.** I3 says a replay "moves money exactly once". A balance delta alone cannot distinguish
one application from two that happened to net out.

**Choice.** Exactly **one** transfer row for the key, exactly **two** ledger entries for that
transfer, and the destination delta equal to exactly one `amount` — all three, from stored state.

**Why.** It is the only count that cannot be faked by compensating writes, and it ties I3 to I4.

**If wrong.** Nothing weakens; the check is a superset of the balance check.
