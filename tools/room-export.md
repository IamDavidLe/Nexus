# Exporting the room

The rules require the repository to contain the BAND room export for every submitted stage, and the
video to show the room recording. Export after every run, dry runs included.

## Where it goes

| Run | Folder |
|-----|--------|
| Official stage N | `room-export/stage-N/` |
| Dry run | `dryruns/<name>/room-export/` |

Each folder holds the message history, the board (goal and every work item with its full history) and
a short `README.md` naming the room, the dispatch time and the outcome time.

## How

**[VERIFY in dry run 1]** BAND Desktop's own export action is the first choice. If it has none, the
room history and board are readable through BAND's documented interfaces: the room's message history
(including tool calls, thoughts and task events), and the board with each task's append-only history.
Save both as JSON, plus a readable Markdown rendering of the messages.

After confirming the method, replace this section with the exact steps and add a script to `tools/`.

## Checks before committing

- Every seat and every message from dispatch to outcome is present.
- Board items match the IDs in `git log`.
- No secrets: search the export for keys before committing (the pre-commit hook also blocks them).
