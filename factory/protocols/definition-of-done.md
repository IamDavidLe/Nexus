# Definition of done

## A work item is done when

1. Every acceptance criterion is met, each proven by a command in the handoff packet.
2. The Verifier signed off on the reviewed commit, including at least one check it wrote itself
   from the task text (not copied from the Builder's tests).
3. The Breaker signed off on the reviewed commit, with an attack for every stated invariant the item
   touches, run at or above the load the task states.
4. The item's tests are committed and pass in the stage's full suite.

## A stage is done when

1. Every work item on the board is done, or explicitly rescoped by the Planner with the reason
   recorded.
2. The full suite of this stage and of every earlier stage passes on the final commit.
3. The clean offline container check passes: the service builds and starts with no network
   access, within the task's resource limits, and answers its health check.
4. The interface is reachable and usable at the narrow phone width and the wide desktop width
   used by the viewport check in `tools/`, with screenshots saved as evidence. It has clear loading, empty and error states, works by keyboard,
   and shows no console errors.
5. Every assumption made during the stage is recorded in the stage's assumptions file.
6. All handoff packets and evidence are committed under the stage folder.
7. The Integrator has posted the release note and the stage outcome to the room.

If time or budget runs out first, the stage ships its last fully verified state and is declared
partially done (`stop-conditions.md`). An unverified state is never declared done.
