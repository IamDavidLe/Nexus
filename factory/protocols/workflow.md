# Workflow

The loop every stage follows. Seats talk only in the room, always @mentioning the recipient.

1. **Dispatch.** The human posts the stage task once, @mentioning the Planner. That is the only
   human input for the whole stage.
2. **Plan.** The Planner reads the task and the previous stage (if any), sets the board goal, and
   creates work items on the board (`board.md`, `templates/WORKITEM.template.md`). Each has
   acceptance criteria, a dependency list and an owner. The first work item of any stage after
   the first is always "copy the previous stage and prove its suite green"
   (`extend-without-breaking.md`). The Planner then @mentions the Builder with the ordered list,
   and the Verifier and Breaker so they can start deriving checks from the task in parallel.
3. **Claim.** The Builder claims the first unblocked work item on the board. A work item with
   missing or untestable criteria goes straight back to the Planner as a rejection
   (`rejection.md`).
4. **Build.** The Builder makes the smallest change that satisfies the criteria, with tests, and
   commits (`git.md`).
5. **Hand off.** The Builder posts an evidence packet (`handoff.md`) and @mentions the Verifier and
   the Breaker together. It may claim the next unblocked item while review runs.
6. **Review, in parallel.**
   - The Verifier runs its independently derived checks, the clean offline container check, and
     the viewport check when the item touches the interface.
   - The Breaker runs attacks against every invariant the task states that the item touches.
7. **Decide.** Each reviewer posts either a rejection (`rejection.md`) or a sign-off, @mentioning
   the Builder and the Integrator.
   - Any rejection: the Builder fixes, and the loop returns to step 5 with a new packet.
   - Both sign-offs: the work item is accepted on the board.
   - Third rejection of one item: the Planner splits or rescopes it (`autonomy.md`).
8. **Assemble.** The Integrator merges accepted work into the stage folder and reruns the full suite
   of this stage and every earlier stage.
9. **Repeat** until every work item is accepted or a stop condition fires (`stop-conditions.md`).
10. **Declare.** The Integrator requests a final Verifier and Breaker pass on the assembled stage,
    then posts the stage outcome: done, or partially done with exactly what is verified. Only the
    Integrator may declare an outcome.
