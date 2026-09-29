# Standing up the band in BAND Desktop

Verified against `band` CLI 0.4.12, band-peer plugin 0.5.33 and docs.band.ai on 2026-09-28.
Anything still marked **[VERIFY]** is confirmed during the first dry run, then this note is updated.

## How BAND fits the factory

| Factory concept | BAND object |
|---|---|
| Seat | A persistent BAND agent backed by a Claude Code runtime (`band agent create`) |
| Mandate | The agent's owner instructions, live-linked to `factory/mandates/<seat>.md` |
| Room | A BAND chat room; one fresh room per official run |
| Work item | A task on the room's board (history is append-only, never deleted) |
| Stage goal | The board goal (title + summary), set by the Planner from the dispatched task |
| Handoff / rejection | A room message that @mentions the next seat and links the evidence |

Two platform rules shape the protocols:

1. **@mention routing.** An agent only receives messages that @mention it. Every handoff,
   rejection and sign-off must @mention its recipient or it is never seen.
2. **Messages must be sent, not just written.** An agent's plain text output is treated as
   private thinking. Seats must post to the room with the messaging tool for anything others
   need to see.

## One-time machine setup (done)

1. BAND Desktop installed, signed in, daemon running.
2. `band preflight` all green.
3. band-peer plugin installed in Claude Code. On Windows the automatic install fails on the
   backslash path; the working manual install is:
   ```bash
   cd "$LOCALAPPDATA/Band"
   claude plugin marketplace add ./claude-plugin-marketplace
   claude plugin install band-peer@jam
   ```
4. User PATH points at `%LOCALAPPDATA%\Band` (the desktop app's CLI), not a standalone copy.

## Creating the five seats (blueprint step 42)

Run once from the repo root, after the mandates are approved. Each seat gets its own session
scope so five agents can share one working copy. Done on 2026-09-29: all five seats created and
reporting `Connected running=true` in `band list`.

**Prerequisite:** a current Claude Code. The seat runtime is launched with `--permission-mode auto`,
which old versions reject (2.1.17 failed; 2.1.284 works). Run `claude update` first, and remove any
leftover npm-global copy (`npm -g uninstall @anthropic-ai/claude-code`) so BAND launches the native one.

**1. Probe the runtime** (`--dry-run` cannot be combined with `--instructions-file`, so probe without it):

```bash
ROOT=$(pwd -W)   # Windows path in Git Bash; use "$PWD" elsewhere
band agent create --name Planner --cwd "$ROOT" --session planner \
  --transport claude-code-cli --claude-context-mode local_config --claude-strict-mcp-config --dry-run
```

Expect every check to pass and exactly **1 MCP server** (BAND's own relay).

**2. Create the seats:**

```bash
for seat in planner builder verifier breaker integrator; do
  Name="$(tr '[:lower:]' '[:upper:]' <<< ${seat:0:1})${seat:1}"
  band agent create --name "$Name" \
    --description "Dark factory seat: $Name. Standing mandate: factory/mandates/$seat.md" \
    --cwd "$ROOT" --session "$seat" \
    --transport claude-code-cli \
    --claude-context-mode local_config --claude-strict-mcp-config \
    --instructions-file "$ROOT/factory/mandates/$seat.md"
done
```

**3. Verify:**

```bash
band agent instructions show --session planner --reveal   # path points at the mandate file
band list                                                 # five seats, Connected running=true
```

Why these flags:

- `--claude-strict-mcp-config` loads only BAND's relay. Without it a seat inherits every MCP server in
  the operator's personal config (mail, calendars, databases): unsafe for an unattended agent and not
  reproducible from the repo. With it, a seat has the standard coding tools and nothing else.
- `--claude-context-mode local_config` keeps the operator's Claude Code login. `bare` mode is more
  isolated but reads no login, so it only works with an API key in the daemon's environment.

Notes:

- `--instructions-file` stores a **live link**: editing the mandate file updates the seat. Freeze
  mandates (git tag) before the official run so they can't drift mid-run.
- Seat model choice (blueprint step 5): option **B**. Claude Code for Planner, Builder, Verifier and
  Integrator; a Featherless-hosted coder model for the Breaker once the key arrives. Until then the
  Breaker also runs on Claude Code. **[VERIFY]** the Featherless route: `band agent create` supports
  `acp` and `opencode` transports, and the Python SDK has adapters; pick whichever accepts an
  OpenAI-compatible endpoint.
- `--claude-disallowed-tool` can hard-block tools per seat. **[VERIFY]** in dry run 1 whether the
  refusal-only seats should lose direct edit rights outside their test folders.

## Running a room (dry run or official)

1. Start screen recording.
2. In BAND Desktop, create a **new** room and add the five seats and yourself.
3. Paste the task file's full text as one message that @mentions the Planner (and only the Planner).
4. Hands off. The seats plan on the board, build, review and hand off among themselves.
5. When the Integrator posts its stage outcome, stop recording and export the room into
   `room-export/stage-N/` (dry runs: `dryruns/<name>/room-export/`). **[VERIFY]** export steps.
6. Log each seat's usage in `tools/cost-log.md`. `band usage agents` reports tokens and an
   estimated USD equivalent per local agent (catalog estimate, not provider billing; say so in
   FACTORY.md).
