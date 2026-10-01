"""S1-13 acceptance: `POST /transfers` and `GET /transfers/{id}`.

Every status the interface contract lists for these two rows has at least one check
here. Derived by the Verifier from `tasks/stage-1.task.md`.
"""

import json
import re
import unittest
import uuid

try:
    from tests.acceptance_harness import AcceptanceCase
except ImportError:  # pragma: no cover
    from acceptance_harness import AcceptanceCase

ISO8601 = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$")


def body_bytes(source_id, destination_id, amount_literal):
    """A transfer body with `amount` written as a raw JSON literal, so `1.5`, `"10"`,
    `1e2` and `true` reach the service exactly as the task spells them (I5)."""
    return ('{"source_id": "%s", "destination_id": "%s", "amount": %s}'
            % (source_id, destination_id, amount_literal)).encode("utf-8")


class PostTransfersHappyPath(AcceptanceCase):

    def setUp(self):
        self.src = self.http.new_account("Source", 100000)
        self.dst = self.http.new_account("Destination", 500)

    def test_201_shape_and_money_movement(self):
        r = self.http.transfer(self.src["id"], self.dst["id"], 2500)
        body = self.assertJsonResponse(r, 201, "POST /transfers:")
        self.assertEqual(
            {"id", "source_id", "destination_id", "amount", "status", "created_at"}, set(body),
            'task: 201 -> {"id","source_id","destination_id","amount","status":"completed",'
            '"created_at":"<ISO 8601>"}; got %r' % (body,))
        uuid.UUID(str(body["id"]))
        self.assertEqual(self.src["id"], body["source_id"])
        self.assertEqual(self.dst["id"], body["destination_id"])
        self.assertIntegerAmount(body["amount"], "POST /transfers amount")
        self.assertEqual(2500, body["amount"])
        self.assertEqual("completed", body["status"], 'task: "status":"completed"')
        self.assertRegex(str(body["created_at"]), ISO8601,
                         'task: "created_at":"<ISO 8601>"; got %r' % (body["created_at"],))
        balances = self.http.balances()
        self.assertEqual(100000 - 2500, balances[self.src["id"]])
        self.assertEqual(500 + 2500, balances[self.dst["id"]])

    def test_amount_of_exactly_one_minor_unit_is_accepted(self):
        # 'amount: <integer >= 1>' - 1 is inside the contract.
        r = self.http.transfer(self.src["id"], self.dst["id"], 1)
        self.assertJsonResponse(r, 201, "POST /transfers amount 1:")

    def test_transfer_of_the_entire_balance_is_accepted_and_leaves_zero(self):
        # 'source balance is less than amount' is the only funds rejection, so an exact
        # drain must succeed and I2 must still hold.
        drain = self.http.new_account("Drain", 4242)
        r = self.http.transfer(drain["id"], self.dst["id"], 4242)
        self.assertJsonResponse(r, 201, "POST /transfers exact drain:")
        self.assertEqual(0, self.http.balances()[drain["id"]])
        self.assertNoNegativeBalances()

    def test_get_transfer_by_id_returns_the_same_object(self):
        created = self.http.transfer(self.src["id"], self.dst["id"], 300).json()
        r = self.http.get("/transfers/" + created["id"])
        body = self.assertJsonResponse(r, 200, "GET /transfers/{id}:")
        self.assertEqual(created, body,
                         "task: 'GET /transfers/{id} 200 -> the transfer object'")

    def test_get_unknown_transfer_is_404_not_found(self):
        r = self.http.get("/transfers/" + str(uuid.uuid4()))
        self.assertErrorBody(r, 404, "not_found")


class PostTransfersRejections(AcceptanceCase):

    def setUp(self):
        self.src = self.http.new_account("Reject Source", 1000)
        self.dst = self.http.new_account("Reject Destination", 0)

    def test_amount_not_a_positive_integer_is_422(self):
        # Task, I5: 'Reject 1.5, "10", 1e2 and true as amounts.' Plus the contract's
        # '422 invalid_request - amount not a positive integer'.
        cases = {
            "1.5": "1.5",
            '"10" (string)': '"10"',
            "1e2 (exponent)": "1e2",
            "true (bool)": "true",
            "0": "0",
            "-1": "-1",
            "100.0": "100.0",
            "null": "null",
            "1.0000001": "1.0000001",
            "2**63": str(2 ** 63),  # assumption A11
        }
        for label, literal in cases.items():
            with self.subTest(amount=label):
                r = self.http.transfer(None, None, None,
                                       raw_body=body_bytes(self.src["id"], self.dst["id"], literal))
                self.assertErrorBody(r, 422, "invalid_request", detail=True)

    def test_rejected_amounts_move_no_money(self):
        before = self.http.balances()
        for literal in ("1.5", '"10"', "1e2", "true", "0", "-5"):
            self.http.transfer(None, None, None,
                               raw_body=body_bytes(self.src["id"], self.dst["id"], literal))
        self.assertEqual(before, self.http.balances(),
                         "a 422 transfer must not touch any balance")

    def test_amount_missing_is_422(self):
        raw = ('{"source_id": "%s", "destination_id": "%s"}'
               % (self.src["id"], self.dst["id"])).encode()
        r = self.http.transfer(None, None, None, raw_body=raw)
        self.assertErrorBody(r, 422, "invalid_request", detail=True)

    def test_source_equals_destination_is_422(self):
        # Task: '422 invalid_request - ... source equals destination'
        r = self.http.transfer(self.src["id"], self.src["id"], 10)
        self.assertErrorBody(r, 422, "invalid_request", detail=True)

    def test_malformed_body_is_422(self):
        # Task: '422 invalid_request - ... body malformed'
        for label, raw in (("not json", b"{not json"), ("empty", b""), ("array", b"[]"),
                           ("string body", b'"hello"')):
            with self.subTest(body=label):
                r = self.http.transfer(None, None, None, raw_body=raw)
                self.assertErrorBody(r, 422, "invalid_request", detail=True)

    def test_unknown_account_is_404_not_found(self):
        # Task: '404 not_found - either account does not exist'
        missing = str(uuid.uuid4())
        with self.subTest(side="source"):
            self.assertErrorBody(self.http.transfer(missing, self.dst["id"], 10), 404, "not_found")
        with self.subTest(side="destination"):
            self.assertErrorBody(self.http.transfer(self.src["id"], missing, 10), 404, "not_found")

    def test_insufficient_funds_is_409_and_writes_nothing(self):
        # Task: '409 insufficient_funds - source balance is less than amount. Nothing is
        # written.'
        before = self.http.balances()
        r = self.http.transfer(self.src["id"], self.dst["id"], before[self.src["id"]] + 1)
        self.assertErrorBody(r, 409, "insufficient_funds")
        self.assertEqual(before, self.http.balances(),
                         "'Nothing is written' - balances must be untouched")
        history = self.http.get("/transfers?account_id=" + self.src["id"])
        self.assertEqual(200, history.status, "history lookup failed: %r" % (history,))
        self.assertEqual([], history.json()["transfers"],
                         "'Nothing is written' - a rejected transfer must not appear in history")
        self.assertNoNegativeBalances()

    def test_destination_balance_overflow_is_rejected_without_writing(self):
        # SQLite silently converts an overflowing INTEGER expression to REAL.
        # That would break the minor-unit invariant, so the API must reject it
        # before updating either account.
        near_limit = self.http.new_account("Near integer limit", 2 ** 63 - 1)
        before = self.http.balances()
        r = self.http.transfer(self.src["id"], near_limit["id"], 1)
        self.assertErrorBody(r, 422, "invalid_request")
        self.assertEqual(before, self.http.balances())

    def test_missing_idempotency_key_is_400(self):
        # Task: 'Header: Idempotency-Key: <1-128 chars> - required' and
        # '400 missing_idempotency_key - header absent or empty'
        with self.subTest(case="absent"):
            self.assertErrorBody(self.http.transfer(self.src["id"], self.dst["id"], 10, key=None),
                                 400, "missing_idempotency_key")
        with self.subTest(case="empty"):
            self.assertErrorBody(self.http.transfer(self.src["id"], self.dst["id"], 10, key=""),
                                 400, "missing_idempotency_key")

    def test_missing_idempotency_key_moves_no_money(self):
        before = self.http.balances()
        self.http.transfer(self.src["id"], self.dst["id"], 10, key=None)
        self.assertEqual(before, self.http.balances(),
                         "a 400 missing_idempotency_key must not move money")

    def test_history_rejects_missing_empty_or_malformed_account_id(self):
        for account_id in (None, "", "not-a-uuid"):
            with self.subTest(account_id=account_id):
                suffix = "" if account_id is None else "=" + account_id
                r = self.http.get("/transfers?account_id" + suffix)
                self.assertErrorBody(r, 422, "invalid_request")

    def test_key_boundaries_1_and_128_chars_are_accepted(self):
        for key in ("k", "k" * 128):
            with self.subTest(key_len=len(key)):
                r = self.http.transfer(self.src["id"], self.dst["id"], 1, key=key)
                self.assertJsonResponse(r, 201, "Idempotency-Key length %d:" % len(key))

    def test_reused_key_with_a_different_body_is_409_idempotency_key_reused(self):
        # Task: '409 idempotency_key_reused - same key, different request body'
        key = "reuse-" + uuid.uuid4().hex
        first = self.http.transfer(self.src["id"], self.dst["id"], 11, key=key)
        self.assertJsonResponse(first, 201, "first use of the key:")
        after_first = self.http.balances()
        second = self.http.transfer(self.src["id"], self.dst["id"], 12, key=key)
        self.assertErrorBody(second, 409, "idempotency_key_reused")
        self.assertEqual(after_first, self.http.balances(),
                         "a 409 idempotency_key_reused must not move money")

    def test_reordered_keys_in_the_same_body_are_a_replay_not_a_reuse(self):
        # Assumption A7: 'same body' means the same validated source_id, destination_id
        # and amount, so a reordered JSON object is a replay (I3), not a 409.
        key = "reorder-" + uuid.uuid4().hex
        first = self.http.transfer(self.src["id"], self.dst["id"], 13, key=key)
        created = self.assertJsonResponse(first, 201, "A7 first request:")
        reordered = json.dumps({"amount": 13, "destination_id": self.dst["id"],
                                "source_id": self.src["id"]}).encode()
        second = self.http.post("/transfers", raw_body=reordered,
                                headers={"Idempotency-Key": key})
        replay = self.assertJsonResponse(second, 201, "A7 reordered replay:")
        self.assertEqual(created["id"], replay["id"],
                         "A7: a reordered body with the same values is a replay, not a 409")


if __name__ == "__main__":
    unittest.main()
