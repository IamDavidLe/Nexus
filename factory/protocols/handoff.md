# Handoff: the evidence packet

Every handoff, from any seat, carries a complete packet. Reviewers reject any handoff whose packet
is missing a section. Use `factory/templates/HANDOFF.template.md`.

## Required sections

1. **Work item** — the board ID and title, and the acceptance criteria being claimed.
2. **Files changed** — output of `git diff --stat` against the commit before the work started,
   plus the commit hashes.
3. **Commands run** — every build, test and check command, each with its exact, unedited output.
   Long output is saved to `stage-N/evidence/<work item>/` and referenced by path; the packet
   keeps the last lines, including the summary and exit code.
4. **Results against criteria** — one line per acceptance criterion: met or not met, and the
   command whose output proves it.
5. **Known gaps** — anything unfinished, assumed or deliberately out of scope. "None" is allowed
   only if true.
6. **How to reproduce** — the exact commands a reviewer runs, from a clean checkout of the stated
   commit, to see the same results.

## Rules

- Output is pasted, never summarised. "Tests pass" without the output is not evidence.
- The packet names a commit. Reviewers review that commit, not the working copy.
- A packet is posted to the room and @mentions every seat that must act on it.
- Evidence files are committed, so the packet still makes sense after the room is exported.
