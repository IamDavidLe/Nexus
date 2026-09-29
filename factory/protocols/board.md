# The board

Work items live on the room's native task board, not only in chat. Judges read the room: the board
shows the plan, who owns what, and every status change, with an append-only history.

## Goal

At dispatch, the Planner sets the board goal: the title is the stage name, and the summary is the
task's goal in two sentences plus the definition of done. The goal is edited only if the Planner
rescopes the stage, with the reason posted in the room.

## Work items

- One board task per work item, created only by the Planner, using the fields in
  `factory/templates/WORKITEM.template.md`.
- IDs are `S<stage>-<two-digit number>`, for example `S2-07`. They are never reused. The same ID
  appears in commit messages, evidence folders and room messages.
- Each item is assigned to the seat doing the next step: the Builder while building, the Verifier
  and Breaker together while in review.

## Status flow

| Status | Meaning | Set by |
|--------|---------|--------|
| planned | Created, dependencies not yet met | Planner |
| ready | Dependencies met, can be claimed | Planner |
| building | Claimed and in progress | Builder |
| in review | Packet posted, awaiting both reviewers | Builder |
| rejected | At least one valid rejection; back to building | Verifier or Breaker |
| accepted | Both sign-offs on the reviewed commit | Integrator |
| rescoped | Split, narrowed or cancelled, with the reason | Planner |

## History

Every rejection, sign-off and assumption relevant to an item is added to its history as a comment
that links the room message. Items are never deleted: they are rescoped or superseded, so the full
record survives into the room export.
