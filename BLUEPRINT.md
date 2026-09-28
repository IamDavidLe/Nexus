# BLUEPRINT.md — Dark Factory Hackathon (WeAreDevelopers x BAND)

> **Deadline:** Mon Oct 5, 2026, 23:59 PDT. Target submit: **Oct 5, 12:00 PDT** (12h buffer).
> **Today:** Mon Sep 28. You have ~7.5 days.
> **Prize:** $1,500 / $1,000 / $500 per track. Judging = Factory 50% · App 25% · Agent Teamwork 25%.

---

## READ THIS FIRST (instructions for Claude Code)

You are Claude Code running in VS Code. Your job is to **build the factory**, not the product.

1. Read this entire file before doing anything.
2. Work phase by phase, step by step. Check off `[ ]` → `[x]` in this file as you finish each step and commit.
3. Steps marked **🧑 HUMAN** require Rohit. Stop, print exactly what he needs to do, and wait.
4. Steps marked **🤖 CLAUDE** are yours.
5. Anything marked **[VERIFY]** is an assumption. Confirm it against `spec/` or docs.band.ai before relying on it. Never invent BAND CLI commands — read the docs.
6. **THE ONE RULE:** You never write code inside `stage-1/` … `stage-4/`. That code must be produced by the BAND seats in the BAND room, or the entry fails "code traces to the room" and "Autonomy." You write mandates, tooling, docs, lint, container checks, and dry-run scaffolding only.

---

## HARD CONSTRAINTS (any violation = disqualified or zero)

| # | Rule | How we enforce it |
|---|------|-------------------|
| C1 | ≥3 distinct coding-agent seats in BAND Desktop, each with a mandate file | `factory/mandates/*.md`, one per seat |
| C2 | Mandates are **generic**: no endpoint paths, field names, error codes, or anything track-specific | `tools/lint-mandates.sh` + banned-terms list, run in CI |
| C3 | Video includes the **BAND Desktop room recording** + walkthrough | Record every official stage run from the start |
| C4 | Service builds and serves from a **clean container with no outbound network** | `tools/clean-container-check.sh` using `--network none` |
| C5 | Public GitHub repo, clonable without BAND membership | Public from day 1, no secrets committed |
| C6 | One folder per completed stage: `stage-1/` … `stage-4/`, each complete and buildable. Minimum: complete stage 1 | Verifier seat refuses sign-off without a green container check |
| C7 | Repo contains mandates, `FACTORY.md`, and the BAND room export | Phase I checklist |
| C8 | In the submitted run, **the dispatched task per stage is the only human input** — no steering, approvals, reruns | Dry runs until stable; official run in a fresh room; hands off keyboard |
| C9 | Submission is original and MIT-compliant | `LICENSE` = MIT |

---

## REPO LAYOUT (target)

```
dark-factory/
├── BLUEPRINT.md              # this file
├── FACTORY.md                # how to stand up the factory (judged, 50% bucket)
├── README.md                 # judge-facing overview + quickstart
├── LICENSE                   # MIT
├── factory/
│   ├── mandates/             # one generic mandate per seat
│   │   ├── planner.md
│   │   ├── builder.md
│   │   ├── verifier.md
│   │   ├── breaker.md
│   │   └── integrator.md
│   ├── protocols/
│   │   ├── handoff.md        # evidence packet format
│   │   ├── definition-of-done.md
│   │   └── rejection.md      # when/how a seat refuses work
│   └── templates/
│       ├── HANDOFF.template.md
│       └── WORKITEM.template.md
├── tasks/                    # the ONLY place track detail lives
│   ├── stage-1.task.md
│   ├── stage-2.task.md
│   ├── stage-3.task.md
│   └── stage-4.task.md
├── tools/
│   ├── lint-mandates.sh
│   ├── banned-terms.txt
│   ├── clean-container-check.sh
│   └── cost-log.md
├── spec/                     # official spec copied in at kickoff (read-only)
├── dryruns/                  # decoy-problem runs (not submitted as stages)
├── room-export/              # BAND room export(s)
├── stage-1/ … stage-4/       # built ONLY by the band
└── media/                    # cover image, slides, video link
```

---

## PHASE 0 — Decide (Step 0)

- [ ] **Step 0 🧑 HUMAN — Pick the track and commit.**
  Track: **💸 pocketful** — a clean-room wallet and payments app, like Venmo.
  The hard part: **money must never be created, destroyed or spent twice, under concurrent transfers, retries and rounding.** That's one conservation invariant you can prove mechanically (sum of all balances before = sum after, for every run), which makes for a strong Breaker story and a strong demo.
  Pick once; you only compete within this track. Write `pocketful` into `tasks/TRACK`. Everything below says `<TRACK>` = pocketful.

---

## PHASE A — Accounts, tools, environment (Steps 1–10) · Mon Sep 28

- [ ] **1 🧑** Confirm enrollment on lablab.ai (already done) and join the lablab.ai Discord.
- [ ] **2 🧑** Create free BAND account, download BAND Desktop, join the BAND Discord.
- [ ] **3 🧑** Check email for the Featherless promo code + setup guide. Redeem it. Set a calendar reminder to cancel before the next billing cycle.
- [ ] **4 🧑** In BAND Desktop: sign in, install the CLI and the coding-agent plugin, **run the readiness checks** (docs.band.ai/jam). Screenshot the green result → `media/readiness.png`.
- [ ] **5 🧑** Decide the seat runtime(s). Default: Claude Code for seats (strongest coder), optionally one Featherless-backed seat (e.g. Qwen/DeepSeek coder) for the Breaker to show model diversity and lower cost. [VERIFY which adapters BAND supports in SDK setup docs.]
- [ ] **6 🤖** `git init` the repo with the layout above, MIT `LICENSE`, `.gitignore` (node_modules, .env, *.key, room caches).
- [ ] **7 🧑** Create the **public** GitHub repo `dark-factory` and push.
- [ ] **8 🤖** Add `.env.example` listing required keys (names only). Add a pre-commit hook that blocks commits containing `sk-`, `ANTHROPIC_API_KEY=`, `FEATHERLESS` key patterns.
- [ ] **9 🤖** Verify Docker works locally: `docker run --rm --network none alpine echo ok`. Record Docker version in `tools/env.md`.
- [ ] **10 🤖** Create `tools/cost-log.md` with a table: `date | run | seat | model | tokens in | tokens out | $ | wall time`. Every run from now on gets a row (judged: "measured costs").

---

## PHASE B — Spec intake (Steps 11–18) · Mon Sep 28

- [ ] **11 🧑** Get the official spec published at kickoff (lablab page / BAND Discord / docs). Download every file into `spec/`. Include the harness notes: CPU/memory caps, harness concurrency, per-request timeouts.
- [ ] **12 🤖** Create `spec/INDEX.md`: list every spec file with a one-line summary.
- [ ] **13 🤖** Extract per-stage requirements into `spec/STAGES.md`: for each stage 1–4, list required behaviours, interfaces, invariants, and what "complete" means. Quote the spec; don't paraphrase contracts.
- [ ] **14 🤖** Extract the **invariants** into `spec/INVARIANTS.md` for pocketful: (a) conservation — total money in the system only changes through explicitly specified entry/exit operations; (b) no double-spend — the same transfer, retried or replayed, moves money at most once; (c) no overdraft if the spec forbids negative balances; (d) rounding never creates or loses a minor unit; (e) concurrent transfers from one account can't jointly exceed its balance. Copy the spec's exact wording for each. These become Breaker attack targets — in the task files, not mandates.
- [ ] **15 🤖** Extract every endpoint path, field name, error code, status value, and domain noun from the spec into `tools/banned-terms.txt` (one per line). Also add the track names and obvious domain words (`pocketful`, `tablekeeper`, `venmo`, `wallet`, `transfer`, `balance`, `payment`, `payee`, `payer`, `money`, `cents`, `currency`, `ledger`, `debit`, `credit`, `overdraft`, `refund`, etc.).
  ⚠️ `ledger`, `credit` and `transaction` are tempting in generic mandates ("database transaction", "credit the author"). Ban `ledger`/`debit`/`credit` outright; allow `transaction` only as "database transaction" (see step 37).
- [ ] **16 🤖** Extract runtime limits into `spec/LIMITS.md`: CPU, RAM, concurrency, timeouts, port, start command, health check. [VERIFY] whether dependencies may be fetched at build time or must be vendored — the rule says "build and serve from a clean container with no outbound network", so **assume both build and run are offline** unless the spec says otherwise.
- [ ] **17 🧑** Read `spec/STAGES.md` and `spec/INVARIANTS.md` yourself (15 min). Ask questions in BAND Discord for anything ambiguous. Log answers in `spec/CLARIFICATIONS.md` with links.
- [ ] **18 🤖** Write `spec/RISKS.md`: the top 5 ways this spec gets failed (concurrent transfers racing on one balance, retried/replayed transfers, floating-point money, rounding on splits/fees, offline container build, UI missing), each with how the task brief will force the band to address it.

---

## PHASE C — Factory design (Steps 19–30) · Tue Sep 29

- [ ] **19 🤖** Write `factory/DESIGN.md`: the band's shape. Recommended 5 seats (min is 3; 5 gives real review and a clear story):

  | Seat | Writes code? | Owns | Can reject? |
  |------|--------------|------|-------------|
  | **Planner** | No | Breaking the task into work items with acceptance criteria and dependency order | Rejects ambiguous or untestable work items back to itself; never to the human |
  | **Builder** | Yes | Implementing work items, unit tests, the build/run files | Rejects work items missing acceptance criteria |
  | **Verifier** | No (test code only) | Independent acceptance checks against the task, clean-container check | Rejects any handoff without a complete evidence packet or with a failing check |
  | **Breaker** | No (test code only) | Adversarial tests against stated invariants: concurrency, retries, boundary inputs | Rejects if any invariant attack succeeds |
  | **Integrator** | Minimal (glue only) | Merging, stage folder assembly, final build, release note, stop condition | Rejects release if Verifier or Breaker hasn't signed off |

  The story for judges: **two of five seats can't ship product code; their only power is refusal.** Review must visibly change things.
- [ ] **20 🤖** Write `factory/protocols/workflow.md`: the loop. Task arrives → Planner emits work items → Builder claims one → Builder hands off with evidence → Verifier + Breaker check in parallel → reject (back to Builder with a reproducible failure) or accept → Integrator assembles → repeat → Integrator declares stage done.
- [ ] **21 🤖** Write `factory/protocols/handoff.md` — the evidence packet every handoff must contain: work item ID, files changed, commands run with exact output, test results, known gaps, how to reproduce. No packet → automatic reject.
- [ ] **22 🤖** Write `factory/protocols/rejection.md`: a rejection must include the failing command, observed vs expected, and the smallest reproduction. Vague rejections are themselves rejected by the Builder.
- [ ] **23 🤖** Write `factory/protocols/definition-of-done.md` (generic): all acceptance criteria in the task pass; independent verifier check passes; adversarial checks pass; clean offline container build + start + health check passes; UI reachable and usable at mobile and desktop widths; handoff packets archived.
- [ ] **24 🤖** Write `factory/protocols/autonomy.md` — **critical for C8**: seats never ask the human anything. If blocked, a seat records the assumption it made, the reason, and proceeds. Max 3 reject cycles per work item before the Planner splits or rescopes it. The Integrator is the only seat allowed to declare a stage finished or partially finished.
- [ ] **25 🤖** Write `factory/protocols/stop-conditions.md`: time box per stage [VERIFY a sensible limit after dry runs], token budget per stage, and what the Integrator ships if the box runs out (the last fully verified state, never an unverified one).
- [ ] **26 🤖** Write `factory/protocols/extend-without-breaking.md`: every stage N starts by copying stage N-1 into `stage-N/`, running the previous stage's full test suite green **before** any change, and keeping it green. This directly addresses "extend what it built without breaking what already works."
- [ ] **27 🤖** Write `factory/templates/WORKITEM.template.md` and `HANDOFF.template.md`.
- [ ] **28 🤖** Decide how work items are represented in BAND (BAND Desktop shows "work items and decisions" on its board). [VERIFY] via docs.band.ai how seats create/claim/close work items and record decisions, and use native BAND objects rather than chat-only coordination — judges read the room.
- [ ] **29 🤖** Write `factory/protocols/git.md`: each seat commits with a prefix (`[planner]`, `[builder]`, `[verifier]`, `[breaker]`, `[integrator]`) and references the work item ID. This makes "code traces to the room" provable from `git log`.
- [ ] **30 🧑** Review `factory/DESIGN.md` and protocols. Approve or edit. (10 min.)

---

## PHASE D — Mandates (Steps 31–42) · Tue Sep 29

Mandates are the heart of the 50% Factory score and the #1 disqualifier. Write them as if the next job were a hospital scheduling system or a compiler.

- [ ] **31 🤖** Write `factory/mandates/planner.md` using this skeleton (all five mandates share it):
  ```
  # Mandate: <Role>
  ## Purpose            — one sentence, domain-free
  ## You own            — artifacts/decisions only you may produce
  ## You never          — explicit prohibitions (e.g. "never edit product source")
  ## Taking work        — what you pick up, from whom, in what state
  ## Doing work         — your method, step by step
  ## Handing off        — required evidence packet (link protocols/handoff.md)
  ## Rejecting          — exact conditions + required rejection format
  ## When blocked       — assume, record, proceed; never ask the human
  ## Done means         — your exit condition
  ```
- [ ] **32 🤖** Write `builder.md`. Include: read the task + prior stage first; smallest change that satisfies a work item; tests with every change; enforce correctness invariants at the storage layer, not only in application code (generic phrasing — no domain words); make every externally triggered write safe to retry.
- [ ] **33 🤖** Write `verifier.md`. Include: derive checks only from the task text, never from the Builder's code or tests; run the clean offline container check; test UI at a narrow and a wide viewport; reject on any unexplained difference.
- [ ] **34 🤖** Write `breaker.md`. Include: read the invariants stated in the task; for each, write an attack (parallel conflicting requests, duplicate/replayed requests, boundary values, clock and calendar edge cases, precision edge cases); an invariant is "held" only if the attack runs at or above the concurrency stated in the task.
- [ ] **35 🤖** Write `integrator.md`. Include: assemble the stage folder; run previous stages' suites; confirm sign-offs; write the stage release note; apply stop conditions; export evidence.
- [ ] **36 🤖** Write `tools/lint-mandates.sh`: case-insensitive grep of every line in `tools/banned-terms.txt` against `factory/mandates/*.md` and `factory/protocols/*.md`. Also flag: anything matching `/[a-z]+/` URL-like paths, `snake_case` or `camelCase` identifiers, HTTP status numbers, and 3-digit error codes. Exit non-zero on any hit.
- [ ] **37 🤖** Handle the `transaction` collision: allow it only in the phrase "database transaction"; flag any other use. Document the exception inside the script.
- [ ] **38 🤖** Add a GitHub Action `.github/workflows/mandate-lint.yml` running the lint on every push. Badge it in the README — visible proof of genericness.
- [ ] **39 🤖** Run the lint. Fix every hit by generalizing the wording, never by removing the rule.
- [ ] **40 🤖** **The swap test:** write `factory/SWAP-TEST.md` — reread each mandate against three unrelated projects (a CLI compiler, a hospital shift scheduler, an e-commerce search service) and record one sentence per project per seat confirming it still makes sense. This is the exact test the rules describe; showing it to judges is free points.
- [ ] **41 🧑** Read all five mandates. Anything that smells like the track → cut it. (15 min.)
- [ ] **42 🧑** Create the five seats in BAND Desktop, attach each mandate file as the seat's standing instruction, assign runtime/model per Step 5. Screenshot the seat list → `media/seats.png`. [VERIFY] how BAND attaches mandates to seats.

---

## PHASE E — Generic tooling the band will use (Steps 43–55) · Tue Sep 29 – Wed Sep 30

All tools here are domain-free. They live in `tools/` and are referenced by mandates generically ("run the container check in tools/").

- [ ] **43 🤖** `tools/clean-container-check.sh <stage-dir>`: `docker build --network none` (fallback: build then run with `--network none` if spec allows build-time fetch — see step 16), run with the spec's CPU/memory caps (`--cpus`, `--memory`) and `--network none`, wait for health, hit the health endpoint path **read from an env/arg, not hard-coded**, exit 0/1, save log to `<stage-dir>/evidence/container-check.log`.
- [ ] **44 🤖** Test step 43 on a hello-world server with vendored deps. Confirm it fails correctly when a dependency needs the network.
- [ ] **45 🤖** `tools/offline-deps.md`: generic guidance for vendoring deps per ecosystem (npm `npm ci` into image with lockfile + vendored cache, pip wheels directory, Go vendor). The task brief picks the stack.
- [ ] **46 🤖** `tools/race.sh`/`tools/race.py`: generic concurrency driver — takes a request template file, N parallel workers, M repeats, and a results file. No domain logic. Breaker uses it with templates it writes during the run.
- [ ] **47 🤖** `tools/replay.py`: sends the same request K times (same idempotency header if the target supports one — header name passed as arg) to test retry-safety.
- [ ] **48 🤖** `tools/viewport-check`: headless screenshot of a URL at 375px and 1280px (Playwright), saved to evidence. [VERIFY] Playwright browsers can be installed locally; this runs outside the product container, so network is fine here.
- [ ] **49 🤖** `tools/evidence-pack.sh`: bundles `git diff --stat`, test output, container log, and screenshots into `<stage-dir>/evidence/<workitem>/`.
- [ ] **50 🤖** `tools/cost-capture.md`: how to read token usage per seat from BAND/runtime logs [VERIFY], and append to `tools/cost-log.md`.
- [ ] **51 🤖** `tools/room-export.md`: how to export the BAND room [VERIFY in docs], where to save (`room-export/stage-N/`).
- [ ] **52 🤖** Write a tiny `tools/README.md` explaining each tool in one line, domain-free.
- [ ] **53 🤖** Re-run the mandate lint over `tools/*.md` too (tools are referenced by mandates; keep them generic).
- [ ] **54 🤖** Commit, push, confirm the lint Action is green.
- [ ] **55 🧑** Sanity check: can a stranger clone this repo and understand the factory in 5 minutes from `README.md` + `factory/DESIGN.md`? If not, tell Claude what's unclear.

---

## PHASE F — Dry runs on decoy problems (Steps 56–65) · Wed Sep 30 – Thu Oct 1

Purpose: tune the factory until an unattended run succeeds, and prove genericness on non-track problems. Dry runs are never submitted as stages. Rerunning here is fine; rerunning in the official run is not.

- [ ] **56 🤖** Write `dryruns/decoy-1.task.md`: a small unrelated service with one concurrency invariant (e.g. a warehouse stock-reservation service: "stock on hand never goes below zero under concurrent picks"). Deliberately **not** a money domain, so success proves the mandates aren't secretly tuned for pocketful. Include a UI requirement and the offline container requirement, mirroring the real task's structure.
- [ ] **57 🧑** Start screen recording. Create a fresh BAND room, add all five seats, paste `decoy-1.task.md`. **Hands off.** Let it run to the Integrator's done/stop.
- [ ] **58 🧑** Export the room, save to `dryruns/decoy-1/room-export/`. Log cost + wall time.
- [ ] **59 🤖** Post-mortem `dryruns/decoy-1/POSTMORTEM.md`: where did seats stall, loop, ask the human, skip evidence, or approve bad work? Which rejections actually changed code? Did the container check pass?
- [ ] **60 🤖** Patch mandates/protocols to fix root causes — **generically**. Re-run lint.
- [ ] **61 🤖** Write `dryruns/decoy-2.task.md`: a different domain with a multi-stage extension (stage A, then stage B that adds a feature without breaking A). Tests step 26.
- [ ] **62 🧑** Run decoy-2 unattended (record, export, log cost).
- [ ] **63 🤖** Post-mortem + patch again.
- [ ] **64 🤖** Collect the best "review changed something" moment from dry runs for FACTORY.md's "how it catches bad work" section (e.g. Breaker's race found a double-write; Builder moved the guarantee into a DB constraint).
- [ ] **65 🧑** **Go/no-go gate:** only proceed to the official run when a dry run completes with **zero** human input from dispatch to done. If not, repeat 60–63 (max 2 more cycles, then cut to 4 seats or simplify protocols).

---

## PHASE G — Task briefs (Steps 66–72) · Thu Oct 1

Task files are where ALL track detail lives. They're what you paste into the room — the only human input allowed in the official run. Make them complete enough that no seat ever needs to ask.

- [ ] **66 🤖** Write `tasks/stage-1.task.md` from `spec/STAGES.md`: goal, full interface contract (copied verbatim from spec), invariants (from `spec/INVARIANTS.md`), runtime limits (from `spec/LIMITS.md`), required stack and offline-build rules, required UI (responsive, mobile + desktop), required output folder `stage-1/`, and the definition of done.
- [ ] **67 🤖** Put the stack decision in the task (not the mandates). Choose the stack that best survives an offline container build and gives the strongest storage-level guarantee for the invariant (e.g. a DB with transactional constraints). Justify in one paragraph. [VERIFY against `spec/LIMITS.md`.]
  Pocketful requirements to put in the task text (never in mandates):
  - Money stored as **integers in minor units** (cents). No floats anywhere in the money path, including JSON parsing.
  - **Double-entry ledger**: every transfer writes balanced debit + credit entries in one database transaction; balances are derived from, or checked against, entries.
  - **Idempotency keys** on every money-moving request: same key replayed = same result, money moves once.
  - **Row locking or serializable isolation** on the source balance, plus a DB constraint rejecting negative balances (if the spec forbids overdraft).
  - An explicit **rounding rule** for any split/fee/conversion, with remainder assignment defined so the sum is exact.
  - A conservation check the Breaker runs after every race: sum of balances + external in/out = constant.
  - Anything the spec says about currencies, limits or statuses copied verbatim.
- [ ] **68 🤖** Add to each task: "Assumptions allowed; record each in `stage-N/ASSUMPTIONS.md`. Do not ask for clarification."
- [ ] **69 🤖** Write `tasks/stage-2.task.md` … `stage-4.task.md`. Each begins: "Copy `stage-(N-1)/` to `stage-N/`. Previous stage's full suite must stay green."
- [ ] **70 🤖** Add UI polish requirements to every task (App = 25%): coherent visual design, clear empty/error/loading states, works at 375px width, keyboard accessible, no console errors. The Verifier checks these via `tools/viewport-check`.
- [ ] **71 🤖** Run a "would a seat need to ask?" pass on every task file: list every ambiguity; resolve it in the text.
- [ ] **72 🧑** Final read of all four task files. Freeze them: `git tag tasks-frozen`.

---

## PHASE H — Official run (Steps 73–85) · Fri Oct 2 – Sat Oct 3

**Rules for yourself during this phase:** one fresh room, recording always on, you paste one task per stage and then touch nothing. No steering, no approvals, no reruns.

- [ ] **73 🧑** Close unrelated apps/notifications (the recording is judged). Set BAND Desktop to a clean, readable layout.
- [ ] **74 🧑** Start screen recording (OBS, 1080p). Create a **new** room named `dark-factory-official`. Add all five seats.
- [ ] **75 🧑** Paste `tasks/stage-1.task.md`. Note timestamp. Hands off.
- [ ] **76 🧑** When the Integrator declares stage 1 done: stop recording segment, export room → `room-export/stage-1/`, log cost/time.
- [ ] **77 🤖** (Read-only check, no edits to `stage-1/`) Run `tools/clean-container-check.sh stage-1` locally and save the output to `media/stage-1-check.log`. If it fails, **do not fix it** — document the failure honestly in FACTORY.md and move on; fixing it by hand breaks autonomy.
- [ ] **78 🧑** Stage 2: resume recording, paste `tasks/stage-2.task.md`, hands off, export on done.
- [ ] **79 🤖** Read-only container check for stage 2; confirm `stage-1/` is unchanged (`git diff tasks-frozen -- stage-1/` only shows the band's commits from stage 1).
- [ ] **80 🧑** Stage 3: same procedure.
- [ ] **81 🤖** Read-only check for stage 3.
- [ ] **82 🧑** Stage 4: same procedure.
- [ ] **83 🤖** Read-only check for stage 4.
- [ ] **84 🤖** Generate `media/traceability.md`: `git log` grouped by seat prefix and work item, mapped to room export message IDs/timestamps. Proves the code traces to the room.
- [ ] **85 🤖** Generate `media/review-impact.md`: every rejection in the run, what it caught, and the commit that fixed it. This is the Collaboration evidence.

> If time runs short: a complete, verified stage 1–2 beats a broken 1–4. Minimum eligibility is a complete stage 1.

---

## PHASE I — Packaging (Steps 86–93) · Sun Oct 4

- [ ] **86 🤖** Write `FACTORY.md` (judged directly). Sections:
  1. **What this is** — one paragraph.
  2. **Stand it up** — exact steps: BAND account, Desktop, CLI + plugin, readiness check, create 5 seats, attach mandates, models, create room, paste task. A stranger should be able to reproduce it.
  3. **Seats** — table from DESIGN.md.
  4. **Design rationale** — why refusal-only seats, why evidence packets, why storage-level invariants, why extend-without-breaking.
  5. **How it catches and recovers from bad work** — the best 3 real examples from the official run (link `review-impact.md`).
  6. **Measured costs** — per stage and total: tokens, $, wall time, from `tools/cost-log.md`.
  7. **Genericness proof** — lint badge, SWAP-TEST.md, and the fact that the same mandates ran two unrelated decoy problems.
  8. **Limitations** — honest list (judges' case studies literally include "the limitation").
- [ ] **87 🤖** Write `README.md`: 3-line pitch, track, stages completed, one-command run per stage (`docker build … && docker run --network none …`), links to FACTORY.md, mandates, room export, video.
- [ ] **88 🤖** Clean-clone test: `git clone` into `/tmp`, run the container check on every submitted stage. All must pass (or be honestly documented).
- [ ] **89 🤖** Remove any stage folder that isn't complete (rules: submit only completed stages). Note it in README.
- [ ] **90 🤖** Final lint over mandates + protocols + tools. Must be green.
- [ ] **91 🤖** Secret scan (`git log -p | grep -iE 'sk-|api[_-]?key'`). Nothing found.
- [ ] **92 🧑** Screenshots of the working UI at mobile + desktop for each stage → `media/`.
- [ ] **93 🤖** Build a 6-slide deck outline in `media/slides.md`: Problem · The band (5 seats, 2 can only refuse) · The invariant and how it's guaranteed · Best rejection that changed the code · Results + costs · Limitations & what's next.

---

## PHASE J — Video + submission (Steps 94–100) · Sun Oct 4 – Mon Oct 5

- [ ] **94 🧑** Edit the video (target 3–5 min): 20s hook → room recording (sped up, with captions at key moments: task pasted, plan emitted, a rejection, the fix, sign-off) → UI demo → FACTORY.md + costs → limitations. **The room recording must be clearly visible** (C3).
- [ ] **95 🧑** Upload video (YouTube unlisted or as lablab requires). Add link to README.
- [ ] **96 🧑** Make slides from `media/slides.md` (export PDF) and a cover image.
- [ ] **97 🤖** Draft the lablab form text into `media/submission.md`: title, short description (≤1 line), long description, tags (BAND, Claude Code, Featherless, Docker, `<TRACK>`).
- [ ] **98 🧑** Fill in the lablab.ai submission form: title, short + long description, tags, cover image, video, slides, public repo URL.
- [ ] **99 🧑** Verify from an incognito window: repo is public, video plays, slides open, form shows submitted. **By Oct 5, 12:00 PDT.**
- [ ] **100 🧑** Post the submission in the BAND + lablab Discords and on X/LinkedIn with the "two of five agents can only refuse" angle. Ask BAND for case-study consideration.

---

## DAILY SCHEDULE (compressed)

| Day | Phases | Exit criterion |
|-----|--------|----------------|
| Mon Sep 28 | 0, A, B | Spec in `spec/`, banned-terms list built, readiness green |
| Tue Sep 29 | C, D, start E | 5 lint-clean mandates, seats created in BAND |
| Wed Sep 30 | finish E, F decoy-1 | Container check works; first unattended dry run done |
| Thu Oct 1 | F decoy-2, G | Zero-touch dry run achieved; tasks frozen |
| Fri Oct 2 | H stages 1–2 | Stage 1–2 verified + exported |
| Sat Oct 3 | H stages 3–4 | All stages exported, traceability generated |
| Sun Oct 4 | I, J (94–97) | FACTORY.md done, video edited |
| Mon Oct 5 | J (98–100) | Submitted by noon PDT |

---

## FAILURE MODES → FIXES

| Symptom | Fix (generic, in mandates/protocols) |
|--------|--------------------------------------|
| Seat asks the human a question | Strengthen `autonomy.md`; add "record assumption and proceed" to that seat's "When blocked" |
| Verifier rubber-stamps | Require it to attach at least one check it wrote independently from the task text |
| Infinite reject loop | 3-cycle cap → Planner rescopes |
| Invariant only enforced in app code | Builder mandate: enforce correctness guarantees at the storage layer |
| Container fails offline | Task specifies vendored deps; Verifier runs the check before every sign-off, not just at the end |
| UI looks generic / broken on mobile | Verifier viewport screenshots are mandatory evidence |
| Lint fails on a mandate | Generalize the sentence; never weaken the lint |
| Stage N breaks stage N-1 | `extend-without-breaking.md`: previous suite green before and after |

---

## THREE-PERSON DELIVERY OWNERSHIP

This is the human delivery team. It does not replace the five BAND seats required by Steps 19 and 42.

### Person 1 — Producer and BAND operator

Owns account setup, approvals, recording, room operations, and submission:

- Steps 0–5, 7, 11, 17, 30, 41–42, and 55.
- Dry-run operation: 57–58, 62, and 65.
- Official-run operation: 73–76, 78, 80, and 82.
- Media and submission: 92 and 94–96, 98–100.

Person 1 is the only person who operates BAND during an official run. After each task dispatch, they remain hands-off until the Integrator's declared outcome.

### Person 2 — Factory architect

Owns the generic factory, task briefs, and judge-facing narrative:

- Repo and spec work: 6, 8, 10, 12–15, and 18.
- Factory design: 19–22 and 24, 26–29.
- Mandates and genericness: 31–32 and 35–40.
- Dry-run design and process changes: 56 and 59–61, 63–64.
- Official task briefs: 66–72.
- Packaging: 84, 86–87, 93, and 97.

Person 2 writes the Planner, Builder, and Integrator mandates. Person 3 must review each for testability and genericness before it is approved.

### Person 3 — Reliability and evidence lead

Owns verification design, offline reliability, and release evidence:

- Environment and spec limits: 9 and 16.
- Quality protocols and mandates: 23, 25, 33–34.
- Tooling and validation: 43–54.
- Official-run read-only checks: 77, 79, 81, 83, and 85.
- Final verification: 88–91.

Person 3 writes the Verifier and Breaker mandates, owns the container, race, replay, viewport, and evidence tooling, and can block an incomplete stage from being presented as complete.

### Handoff gates

1. Person 1 completes account setup, spec intake, and BAND readiness before factory construction starts.
2. Person 2 drafts protocols and mandates; Person 3 runs lint and swap testing; Person 1 approves the release to dry runs.
3. Person 3 completes the reusable tooling before Person 2 freezes the official task briefs.
4. Person 1 operates dry runs; Persons 2 and 3 independently write the post-mortem and implement generic process fixes.
5. During official runs, Person 1 operates BAND, Person 3 performs only the specified read-only checks, and Person 2 prepares traceability and packaging artifacts.
