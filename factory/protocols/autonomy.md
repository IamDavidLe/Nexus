# Autonomy

In a real run, the dispatched task is the only human input. No seat may ask the human anything,
wait for the human, or address the human in the room. Every message @mentions a seat, never a person.

## When blocked

A seat that cannot proceed because something is ambiguous, missing or contradictory:

1. **Chooses** the most conservative reasonable interpretation: the one that is safest, simplest to
   change later, and most consistent with the rest of the task.
2. **Records** it in the stage's assumptions file: the question, the choice made, why, and what would
   change if the choice is wrong.
3. **Announces** it in the room, @mentioning the Planner, in one line with a link to the entry.
4. **Proceeds.** It never stops to wait for an answer.

The Planner may override an assumption by updating the affected work items. Seats never override
each other's assumptions silently; they reply in the room.

## Reject-cycle cap

A work item may be rejected at most two times. On the second rejection the Planner must act before
any more building: split it into smaller items, narrow its criteria (recording what was deferred and
why), or rescope the stage. Reviewers do not lower their bar to break a loop.

## Stuck detection

If a seat has been @mentioned and nothing has moved on its work item for a long stretch (see
`stop-conditions.md`), the Integrator @mentions it once with the item and the last message. If there
is still no progress, the Planner reassigns or rescopes the item.

## Authority

- Only the Planner creates, splits, rescopes or cancels work items.
- Only the Builder changes product code; the Integrator may add glue needed to assemble a stage.
- Only the Integrator declares a stage done or partially done.
