"""S1-01 criterion 7: unknown path 404, known path wrong method 405 + Allow (A8)."""

import unittest

from src.http_app import Router
from src.errors import MethodNotAllowed, NotFound
from tests.support import probe_router, request, running


class RoutingTest(unittest.TestCase):
    def test_unknown_path_is_json_404(self):
        with running() as base:
            response = request(base + "/nope")
        self.assertEqual(response.status, 404)
        self.assertEqual(response.headers["Content-Type"], "application/json")
        self.assertEqual(response.json()["error"], "not_found")

    def test_known_path_wrong_method_is_json_405_with_allow(self):
        with running(probe_router()) as base:
            response = request(base + "/_probe/amount", method="GET")
        self.assertEqual(response.status, 405)
        self.assertEqual(response.headers["Content-Type"], "application/json")
        self.assertEqual(response.headers["Allow"], "POST")
        self.assertEqual(response.json()["error"], "method_not_allowed")

    def test_allow_lists_every_method_the_path_serves(self):
        with running() as base:
            response = request(base + "/healthz", method="DELETE")
        self.assertEqual(response.status, 405)
        self.assertEqual(response.headers["Allow"], "GET")


class RouterUnitTest(unittest.TestCase):
    def test_path_parameters_are_captured(self):
        router = Router()
        router.add("GET", "/accounts/{id}", lambda request: (200, {}))
        handler, params = router.resolve("GET", "/accounts/abc-123")
        self.assertEqual(params, {"id": "abc-123"})
        self.assertTrue(callable(handler))

    def test_a_parameter_never_spans_a_slash(self):
        router = Router()
        router.add("GET", "/accounts/{id}", lambda request: (200, {}))
        with self.assertRaises(NotFound):
            router.resolve("GET", "/accounts/abc/extra")

    def test_unknown_method_on_a_known_path_raises_with_the_allowed_set(self):
        router = Router()
        router.add("GET", "/things", lambda request: (200, {}))
        router.add("POST", "/things", lambda request: (201, {}))
        with self.assertRaises(MethodNotAllowed) as caught:
            router.resolve("DELETE", "/things")
        self.assertEqual(caught.exception.allowed, ("GET", "POST"))


if __name__ == "__main__":
    unittest.main()
