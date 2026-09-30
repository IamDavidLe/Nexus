"""S1-13 acceptance: `POST /accounts`, `GET /accounts`, `GET /accounts/{id}`.

Derived by the Verifier from the interface contract in `tasks/stage-1.task.md`.
"""

import unittest
import uuid

try:
    from tests.acceptance_harness import AcceptanceCase
except ImportError:  # pragma: no cover
    from acceptance_harness import AcceptanceCase

# Task: 'POST /accounts ... 422 -> {"error":"invalid_request","detail":"..."} when name is
# empty/too long, or opening_balance is negative, missing, or not an integer.'
INVALID_ACCOUNT_BODIES = [
    ("empty name", b'{"name": "", "opening_balance": 100}'),
    ("name too long (65 chars)", b'{"name": "' + b"x" * 65 + b'", "opening_balance": 100}'),
    ("name missing", b'{"opening_balance": 100}'),
    ("name not a string", b'{"name": 42, "opening_balance": 100}'),
    ("negative opening_balance", b'{"name": "neg", "opening_balance": -1}'),
    ("opening_balance missing", b'{"name": "missing ob"}'),
    ("opening_balance float 1.5", b'{"name": "f", "opening_balance": 1.5}'),
    ("opening_balance float 100.0", b'{"name": "f0", "opening_balance": 100.0}'),
    ("opening_balance string", b'{"name": "s", "opening_balance": "10"}'),
    ("opening_balance exponent 1e2", b'{"name": "e", "opening_balance": 1e2}'),
    ("opening_balance true", b'{"name": "b", "opening_balance": true}'),
    ("opening_balance null", b'{"name": "n", "opening_balance": null}'),
    ("body is not an object", b'[]'),
    ("body is not JSON", b'not json at all'),
    ("body empty", b''),
]


class PostAccounts(AcceptanceCase):

    def test_201_returns_id_name_balance(self):
        r = self.http.create_account("Acceptance Alice", 12345)
        body = self.assertJsonResponse(r, 201, "POST /accounts:")
        self.assertEqual({"id", "name", "balance"}, set(body),
                         'task: 201 -> {"id":"<uuid>","name":"...","balance":<integer>}; got %r'
                         % (body,))
        self.assertEqual("Acceptance Alice", body["name"])
        self.assertIntegerAmount(body["balance"], "POST /accounts balance")
        self.assertEqual(12345, body["balance"], "opening_balance must become the balance")
        # 'id':'<uuid>' - must parse as a uuid
        uuid.UUID(str(body["id"]))

    def test_opening_balance_zero_is_allowed(self):
        # 'opening_balance: <integer >= 0>' - zero is inside the contract.
        r = self.http.create_account("Zero Balance", 0)
        body = self.assertJsonResponse(r, 201, "POST /accounts opening_balance 0:")
        self.assertEqual(0, body["balance"])

    def test_name_boundaries_1_and_64_chars_are_accepted(self):
        # '<1-64 chars>' - both ends inclusive.
        for name in ("x", "y" * 64):
            r = self.http.create_account(name, 1)
            body = self.assertJsonResponse(r, 201, "POST /accounts name len %d:" % len(name))
            self.assertEqual(name, body["name"])

    def test_invalid_requests_are_422_invalid_request_with_detail(self):
        for label, raw in INVALID_ACCOUNT_BODIES:
            with self.subTest(case=label):
                r = self.http.post("/accounts", raw_body=raw)
                self.assertErrorBody(r, 422, "invalid_request", detail=True)

    def test_invalid_request_writes_no_account(self):
        # Nothing in the contract creates an account from a rejected request.
        before = len(self.http.balances())
        r = self.http.post("/accounts", raw_body=b'{"name": "", "opening_balance": -5}')
        self.assertEqual(422, r.status, "expected 422, got %r" % (r,))
        self.assertEqual(before, len(self.http.balances()),
                         "a rejected POST /accounts must not create an account")

    def test_names_are_not_silently_trimmed(self):
        # Assumption A10: whitespace-only is rejected, names are never silently trimmed.
        r = self.http.create_account("   ", 5)
        self.assertErrorBody(r, 422, "invalid_request", detail=True)
        padded = " Padded Name "
        r = self.http.create_account(padded, 5)
        body = self.assertJsonResponse(r, 201, "A10 padded name:")
        self.assertEqual(padded, body["name"], "A10: names are never silently trimmed")

    def test_amount_at_or_above_2_to_the_63_is_rejected(self):
        # Assumption A11: |value| >= 2**63 is 422, because SQLite integers are 64-bit and
        # an inexact cent is exactly what I1 forbids.
        r = self.http.post("/accounts", raw_body=b'{"name": "big", "opening_balance": ' +
                           str(2 ** 63).encode() + b'}')
        self.assertErrorBody(r, 422, "invalid_request", detail=True)


class GetAccounts(AcceptanceCase):

    def test_200_lists_accounts_in_creation_order(self):
        # Task: 'GET /accounts 200 -> {"accounts":[{"id","name","balance"}, ...]}
        # ordered by creation time.'
        created = [self.http.new_account("Order %02d" % i, i * 100) for i in range(6)]
        r = self.http.get("/accounts")
        body = self.assertJsonResponse(r, 200, "GET /accounts:")
        self.assertEqual(["accounts"], list(body), 'task: the body is {"accounts":[...]}')
        listed = body["accounts"]
        self.assertGreaterEqual(len(listed), len(created))
        for row in listed:
            self.assertEqual({"id", "name", "balance"}, set(row),
                             'task: each row is {"id","name","balance"}; got %r' % (row,))
            self.assertIntegerAmount(row["balance"], "GET /accounts balance")
        ids = [row["id"] for row in listed]
        positions = [ids.index(a["id"]) for a in created]
        self.assertEqual(sorted(positions), positions,
                         "task: 'ordered by creation time'; creation order %r appeared at %r"
                         % ([a["name"] for a in created], positions))

    def test_ordering_survives_identical_names(self):
        # Ordering is by creation time, so it cannot be a name sort.
        made = [self.http.new_account("Same Name", 10) for _ in range(4)]
        ids = [row["id"] for row in self.http.get("/accounts").json()["accounts"]]
        positions = [ids.index(a["id"]) for a in made]
        self.assertEqual(sorted(positions), positions,
                         "'ordered by creation time' must hold for identically named accounts")


class GetAccountById(AcceptanceCase):

    def test_200_returns_the_account(self):
        made = self.http.new_account("Fetch Me", 777)
        r = self.http.get("/accounts/" + made["id"])
        body = self.assertJsonResponse(r, 200, "GET /accounts/{id}:")
        self.assertEqual({"id", "name", "balance"}, set(body),
                         'task: 200 -> {"id","name","balance"}; got %r' % (body,))
        self.assertEqual(made, body, "the fetched account must match the created one")
        self.assertIntegerAmount(body["balance"], "GET /accounts/{id} balance")

    def test_unknown_id_is_404_not_found(self):
        # Task: '404 -> {"error":"not_found"}'
        r = self.http.get("/accounts/" + str(uuid.uuid4()))
        self.assertErrorBody(r, 404, "not_found")

    def test_malformed_id_is_not_a_server_error(self):
        # The contract lists only 200 and 404 for this row; a garbage id must not 500.
        for bad in ("not-a-uuid", "123", "%20"):
            with self.subTest(id=bad):
                r = self.http.get("/accounts/" + bad)
                self.assertIn(r.status, (404, 422),
                              "GET /accounts/%s must be 404 or 422, never a 5xx; got %r"
                              % (bad, r))


if __name__ == "__main__":
    unittest.main()
