# Extend without breaking

Every stage after the first builds on the previous one. What already works must keep working.

## Start of every stage after the first

1. The first work item is always: copy the previous stage folder into the new stage folder
   unchanged, and run the previous stage's full suite there.
2. The suite must be green **before** any change. The Builder's packet for this item shows the full
   output. If it is not green, that is fixed first and nothing else starts.
3. The previous stage folder is never edited again. It stays exactly as it was declared.

## During the stage

- The full suite of every earlier stage runs, from inside the new stage folder, on every handoff.
  A regression is a rejection like any other.
- Behaviour an earlier stage promised may only change if the new task explicitly changes it. Each
  such change is listed in the release note with the task's wording.
- Earlier tests are not deleted or weakened. If the task changes a behaviour, the old test is
  updated in the same commit as the change, and the reason is in the commit message.

## End of every stage

The Integrator runs every stage's suite one final time and attaches the output to the release note.
