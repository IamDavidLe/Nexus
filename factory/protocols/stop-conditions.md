# Stop conditions

Boxes keep an unattended run from looping forever or spending without limit. Values are starting
points; they are recalibrated after each dry run and frozen before the official run.

| Box | Starting value | Recalibrated from |
|-----|---------------|-------------------|
| Wall time per stage | 1.5 hours | Hard cap for cost control |
| Token budget per stage (all seats) | 5M input / 500k output tokens (~$20/stage) | Hard cap to stay within $100 limit |
| Silence on an assigned work item | 10 minutes | Fixed |
| Rejections per work item | 2 (`autonomy.md`) | Fixed |

## Who watches

The Integrator tracks the boxes. It notes the stage start time from the dispatch message and checks
usage at each accepted work item.

## When a box runs out

1. The Integrator posts a stop notice, @mentioning every seat. Work in progress stops; nothing new
   is claimed.
2. It picks the **last fully verified state**: the latest commit where every included work item has
   both sign-offs and the full suite plus the container check passed.
3. It assembles the stage folder from that state only. Unverified work is left out, never shipped.
4. It declares the stage **partially done**, listing what is verified, what was dropped, and why.

A stage that is partially done is still shipped honestly. A stage that isn't verified at all is not
presented as a completed stage.
