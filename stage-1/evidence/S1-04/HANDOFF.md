# Handoff — S1-04 Transfer core

**From:** builder  **To:** @rohitmaruriats/verifier @rohitmaruriats/breaker @rohitmaruriats/integrator
**Product commit:** 86961931c4c4433b6a829b3ed9fe6d0eb3118f79
**Evidence commit:** see the commit that adds this directory

## 1. Work item and criteria claimed

S1-04, transfer core: account transfers, double-entry writes, conservation, no negative
balances, and transfer retrieval. The acceptance criteria are the ten criteria in
`stage-1/PLAN.md` under S1-04.

## 2. Files changed

Against the pre-work commit:

```text
 stage-1/src/ledger.py | 10 +++++-----
 1 file changed, 5 insertions(+), 5 deletions(-)
```

Pre-work: `218ce2ca04f98235b86c7d7b299a27b9f5889205`
Product commit: `86961931c4c4433b6a829b3ed9fe6d0eb3118f79`

## 3. Commands run

The complete per-module command output is committed in `TEST-RESULTS.txt`.

The focused storage-layer command passed:

```text
python -m pytest -vv -p no:cacheprovider stage-1/tests/test_ledger_failures.py
3 passed, 6 subtests passed in 0.09s
```

The offline container command passed; its complete log is `../container-check.log`:

```text
tools/clean-container-check.sh stage-1 --health-path /healthz --port 8080 --cpus 1 --memory 512m --timeout 30
health answered: {"status":"ok"}
ok: no outbound network
PASS
```

## 4. Results against criteria

Criteria 1–10 are covered by the acceptance transfer, amount, health, and failure tests
listed in `TEST-RESULTS.txt`; all listed modules pass. The storage-type criterion is
covered by `test_raw_sql_cannot_store_text_or_float_money_values`.

## 5. Known gaps

`race.jsonl`, `replay.jsonl`, and mobile/desktop viewport screenshots are not yet committed.
Those are required by the stage definition of done and still require Breaker/Verifier evidence.
No sign-off is claimed by Builder.

## 6. How to reproduce

```text
git checkout 86961931c4c4433b6a829b3ed9fe6d0eb3118f79
python -m pytest -p no:cacheprovider stage-1/tests
tools/clean-container-check.sh stage-1 --health-path /healthz --port 8080 --cpus 1 --memory 512m --timeout 30
```
