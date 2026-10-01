"""S1-01 criteria 3-6 and 8: the money chokepoint, over HTTP and in the source."""

import io
import json
import tokenize
import unittest
from pathlib import Path

from src.errors import InvalidRequest
from src.money import INT64_LIMIT, coerce_integer, parse_json_object, require_integer
from tests.support import post_json, probe_router, running

SRC = Path(__file__).resolve().parents[1] / "src"


def probe(payload_bytes, content_type="application/json"):
    with running(probe_router()) as base:
        return post_json(base + "/_probe/amount", payload_bytes, content_type)


class AmountParserTest(unittest.TestCase):
    def test_accepts_a_json_integer(self):
        response = probe(b'{"amount": 1000}')
        self.assertEqual(response.status, 200)
        self.assertEqual(response.json(), {"amount": 1000})

    def test_accepts_zero_and_negative_integers_as_integers(self):
        # Range rules belong to each endpoint; the chokepoint only asserts type.
        self.assertEqual(coerce_integer(0, "amount"), 0)
        self.assertEqual(coerce_integer(-7, "amount"), -7)

    def test_rejects_every_non_integer_amount_with_422(self):
        bodies = {
            "float": b'{"amount": 1.5}',
            "string": b'{"amount": "10"}',
            "exponent": b'{"amount": 1e2}',
            "true": b'{"amount": true}',
            "false": b'{"amount": false}',
            "null": b'{"amount": null}',
            "array": b'{"amount": []}',
            "object": b'{"amount": {}}',
            "missing": b'{}',
        }
        for name, body in bodies.items():
            with self.subTest(case=name):
                response = probe(body)
                self.assertEqual(response.status, 422)
                payload = response.json()
                self.assertEqual(payload["error"], "invalid_request")
                self.assertTrue(payload["detail"])

    def test_a_bare_true_is_not_an_integer_even_though_bool_subclasses_int(self):
        with self.assertRaises(InvalidRequest):
            coerce_integer(True, "amount")


class NoFloatTest(unittest.TestCase):
    """`json.loads` may never construct a float from a request body (I5)."""

    def test_parse_float_hook_raises_instead_of_building_a_float(self):
        with self.assertRaises(InvalidRequest):
            parse_json_object(b'{"amount": 1.5}')

    def test_overflowing_and_special_literals_are_422_not_a_crash(self):
        bodies = [
            b'{"amount": 1e400}',
            b'{"amount": -1e400}',
            b'{"amount": NaN}',
            b'{"amount": Infinity}',
            b'{"amount": -Infinity}',
        ]
        for body in bodies:
            with self.subTest(body=body):
                with self.assertRaises(InvalidRequest):
                    parse_json_object(body)
                response = probe(body)
                self.assertEqual(response.status, 422)
                self.assertEqual(response.json()["error"], "invalid_request")

    def test_a_nested_float_anywhere_in_the_body_is_rejected(self):
        with self.assertRaises(InvalidRequest):
            parse_json_object(b'{"amount": 1, "meta": {"rate": 0.5}}')


class RangeTest(unittest.TestCase):
    """A11: SQLite integers are 64-bit, so |value| >= 2**63 is 422."""

    def test_limit_is_two_to_the_sixty_three(self):
        self.assertEqual(INT64_LIMIT, 2 ** 63)

    def test_largest_and_smallest_storable_integers_are_accepted(self):
        self.assertEqual(coerce_integer(INT64_LIMIT - 1, "amount"), INT64_LIMIT - 1)
        self.assertEqual(coerce_integer(-INT64_LIMIT + 1, "amount"), -INT64_LIMIT + 1)

    def test_at_or_past_the_limit_is_rejected(self):
        for value in (INT64_LIMIT, -INT64_LIMIT, INT64_LIMIT * 4):
            with self.subTest(value=value):
                with self.assertRaises(InvalidRequest):
                    coerce_integer(value, "amount")

    def test_over_http_an_out_of_range_amount_is_422(self):
        body = json.dumps({"amount": 2 ** 63}).encode("utf-8")
        response = probe(body)
        self.assertEqual(response.status, 422)
        self.assertEqual(response.json()["error"], "invalid_request")


class MalformedTest(unittest.TestCase):
    """A malformed body is always 422 invalid_request, never 500."""

    def test_malformed_bodies_over_http(self):
        cases = {
            "invalid json": (b'{"amount":', "application/json"),
            "top level array": (b'[1, 2, 3]', "application/json"),
            "top level scalar": (b'42', "application/json"),
            "empty body": (b"", "application/json"),
            "wrong content type": (b'{"amount": 1}', "text/plain"),
            "missing content type": (b'{"amount": 1}', ""),
            "invalid utf-8": (b'{"amount": "\xff\xfe"}', "application/json"),
        }
        for name, (body, content_type) in cases.items():
            with self.subTest(case=name):
                response = probe(body, content_type)
                self.assertEqual(response.status, 422, name)
                self.assertEqual(response.json()["error"], "invalid_request")

    def test_deeply_nested_json_does_not_crash_the_process(self):
        body = (b"[" * 5000) + (b"]" * 5000)
        response = probe(body)
        self.assertEqual(response.status, 422)
        self.assertEqual(response.json()["error"], "invalid_request")

    def test_required_field_helper_reports_the_field_name(self):
        with self.assertRaises(InvalidRequest) as caught:
            require_integer({}, "opening_balance")
        self.assertIn("opening_balance", str(caught.exception))

    def test_duplicate_keys_are_rejected_at_every_nesting_level(self):
        for body in (b'{"amount": 1, "amount": 2}',
                     b'{"amount": 1, "meta": {"x": 1, "x": 2}}'):
            with self.subTest(body=body):
                with self.assertRaises(InvalidRequest):
                    parse_json_object(body)
                response = probe(body)
                self.assertEqual(422, response.status)
                self.assertEqual("invalid_request", response.json()["error"])


class SourceScanTest(unittest.TestCase):
    """Criterion 8, run as a test: no float construction or division in `src/`.

    The scan tokenises each module and ignores strings and comments, so a path
    like `"/healthz"` is not mistaken for division the way a raw grep would.
    """

    def scan(self):
        findings = []
        for path in sorted(SRC.rglob("*.py")):
            source = path.read_text(encoding="utf-8")
            tokens = tokenize.generate_tokens(io.StringIO(source).readline)
            in_fstring = 0
            for token in tokens:
                name = tokenize.tok_name[token.type]
                if name == "FSTRING_START":
                    in_fstring += 1
                    continue
                if name == "FSTRING_END":
                    in_fstring -= 1
                    continue
                if name in ("STRING", "COMMENT", "FSTRING_MIDDLE"):
                    continue
                if token.type == tokenize.NAME and token.string in ("float", "Decimal"):
                    findings.append((path.name, token.start[0], token.string))
                if token.type == tokenize.OP and token.string in ("/", "/="):
                    findings.append((path.name, token.start[0], token.string))
        return findings

    def test_scan_finds_nothing_in_src(self):
        self.assertEqual(self.scan(), [])

    def test_scan_would_catch_a_violation(self):
        # Proves the scan is not vacuous: the same tokeniser flags real code.
        source = "def rate(a, b):\n    return float(a) / b\n"
        tokens = tokenize.generate_tokens(io.StringIO(source).readline)
        flagged = [
            t.string
            for t in tokens
            if (t.type == tokenize.NAME and t.string == "float")
            or (t.type == tokenize.OP and t.string == "/")
        ]
        self.assertEqual(flagged, ["float", "/"])


if __name__ == "__main__":
    unittest.main()
