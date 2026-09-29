# Handoff — <ID> <title>

**From:** <seat>  **To:** @<seat> @<seat>  **Commit:** <hash>

## 1. Work item and criteria claimed
<ID, title, and the acceptance criteria this handoff claims are met.>

## 2. Files changed
```
<git diff --stat output>
```
Commits: <hashes>

## 3. Commands run
```
$ <command>
<exact output, or the last lines plus the path to the full log under stage-N/evidence/<ID>/>
exit code: <n>
```

## 4. Results against criteria
| # | Criterion | Met? | Proven by |
|---|-----------|------|-----------|
| 1 | <criterion> | yes / no | <command above> |

## 5. Known gaps
<Unfinished work, assumptions (linked to the assumptions file), deliberate exclusions. "None" only if true.>

## 6. How to reproduce
```
git checkout <hash>
<exact commands>
```
