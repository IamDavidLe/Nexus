# Capturing costs

Every run gets one row per seat in `tools/cost-log.md`. Judges score "measured costs", so numbers come
from tooling, never estimates by hand.

## Source

The BAND CLI reads the local coding agents' usage logs and attributes each session to the BAND agent
that owned it:

```bash
band usage agents          # tokens and estimated equivalent cost per local agent
band usage sessions        # the same, per session, if a seat restarted mid-run
band usage daily           # totals per day, for the summary in FACTORY.md
```

The cost column is a catalog-price estimate, not provider billing. Say so wherever it is quoted.
Seats running on another provider (for example the Breaker on a hosted open model) are logged from
that provider's usage page for the same window, and the source is noted in the row.

## Procedure after each run

1. Note the dispatch time and the stage outcome time from the room. Their difference is wall time.
2. Run `band usage agents` and copy each seat's input tokens, output tokens and estimated cost.
3. Add one row per seat to `tools/cost-log.md`, with the run name (for example `dry-1` or `stage-2`).
4. Commit the log with the room export for that run.
