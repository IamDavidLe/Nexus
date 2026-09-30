"""Breaker-owned attack machinery for stage 1.

Nothing in here is product code. The attacks live in ``stage-1/tests/test_attack_*.py`` and are
discovered by the one full-suite command (Planner A12):

    python -m unittest discover -s tests -t . -v      # run from inside stage-1/

The plan these implement is ``stage-1/ATTACK-PLAN.md``; the readings they enforce are
``stage-1/tests/attack/ASSUMPTIONS-BREAKER.md`` (B1-B8).
"""
