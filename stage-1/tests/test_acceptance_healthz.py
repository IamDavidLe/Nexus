"""S1-13 acceptance: `GET /healthz`, start time, and routing fallbacks.

Every assertion below quotes the sentence of `tasks/stage-1.task.md` it comes from.
Derived by the Verifier from the task text, not from the Builder's tests.
"""

import time
import unittest

try:  # discovery from stage-1/ imports this as tests.*; direct runs do not
    from tests.acceptance_harness import AcceptanceCase
except ImportError:  # pragma: no cover
    from acceptance_harness import AcceptanceCase


class HealthzContract(AcceptanceCase):
    """Task, Interface contract: 'GET /healthz -> 200 -> {"status":"ok"}.
    Must answer within 1s of container start.'"""

    def test_healthz_returns_200_status_ok(self):
        r = self.http.get("/healthz")
        payload = self.assertJsonResponse(r, 200, "GET /healthz:")
        self.assertEqual({"status": "ok"}, payload,
                         'task: GET /healthz -> 200 -> {"status":"ok"}; got %r' % (payload,))

    def test_healthz_answers_well_within_one_second(self):
        # 'Must answer within 1s' - measured on a warm process; the cold-start budget
        # is the separate 5s limit under Runtime limits.
        worst = 0.0
        for _ in range(5):
            t0 = time.monotonic()
            r = self.http.get("/healthz", timeout=1.0)
            elapsed = time.monotonic() - t0
            worst = max(worst, elapsed)
            self.assertEqual(200, r.status, "GET /healthz must stay 200, got %r" % (r,))
        self.assertLess(worst, 1.0, "task: /healthz 'must answer within 1s'; worst was %.3fs" % worst)

    def test_service_starts_and_answers_healthz_within_five_seconds(self):
        # Task, Runtime limits: 'Starts and answers /healthz within 5 seconds'.
        # The harness fails start-up outright past 5s; this records the measurement so
        # the sign-off carries a number rather than a pass/fail bit. The containerised
        # equivalent is tests/acceptance_container_start.py.
        self.assertIsNotNone(self.service.started_in, "harness did not record a start time")
        self.assertLess(self.service.started_in, 5.0,
                        "task: 'Starts and answers /healthz within 5 seconds'; took %.3fs"
                        % self.service.started_in)
        print("\n  start-to-healthz: %.3fs (limit 5.000s)" % self.service.started_in)


class RoutingFallbacks(AcceptanceCase):
    """Assumption A8 (`stage-1/ASSUMPTIONS.md`): unknown path -> 404 not_found;
    known path with the wrong method -> 405 with `Allow`. Both JSON. The task states
    'All request and response bodies are JSON' for every response, so a bare HTML
    error page fails here."""

    def test_unknown_path_is_json_404_not_found(self):
        r = self.http.get("/no-such-endpoint")
        self.assertErrorBody(r, 404, "not_found")

    def test_known_path_wrong_method_is_405_with_allow_header(self):
        r = self.http.request("DELETE", "/accounts")
        self.assertEqual(405, r.status, "A8: known path, wrong method -> 405; got %r" % (r,))
        self.assertTrue(r.headers.get("Allow"),
                        "A8: the 405 must carry an Allow header; headers were %r" % (dict(r.headers),))
        self.assertEqual("application/json", r.content_type,
                         "task: 'All request and response bodies are JSON'; got %r"
                         % (r.headers.get("Content-Type"),))


if __name__ == "__main__":
    unittest.main()
