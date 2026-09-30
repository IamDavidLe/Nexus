"""S1-13 acceptance: I3 idempotency, including simultaneous replays.

Task, I3: 'Replaying a POST /transfers with the same Idempotency-Key and the same body
returns the same response with the same transfer id, and moves money exactly once -
including when the replays arrive simultaneously.'
Task, Runtime limits: 'Survives 20 simultaneous replays of one idempotency key with
exactly one money movement.'
"""

import threading
import unittest
import uuid

try:
    from tests.acceptance_harness import AcceptanceCase, Client
except ImportError:  # pragma: no cover
    from acceptance_harness import AcceptanceCase, Client

REPLAYS = 20  # the load the task states


class SequentialReplay(AcceptanceCase):

    def setUp(self):
        self.src = self.http.new_account("Replay Source", 50000)
        self.dst = self.http.new_account("Replay Destination", 0)

    def test_replay_returns_the_same_response_and_moves_money_once(self):
        key = "seq-" + uuid.uuid4().hex
        first = self.http.transfer(self.src["id"], self.dst["id"], 700, key=key)
        created = self.assertJsonResponse(first, 201, "first transfer:")
        after_first = self.http.balances()

        for attempt in range(4):
            r = self.http.transfer(self.src["id"], self.dst["id"], 700, key=key)
            with self.subTest(replay=attempt):
                self.assertIn(r.status, (200, 201),
                              "I3: a replay returns the same response, not %r" % (r,))
                self.assertEqual(created, r.json(),
                                 "I3: 'returns the same response with the same transfer id'")
        self.assertEqual(after_first, self.http.balances(),
                         "I3: replays move money 'exactly once'")

    def test_replay_after_the_source_can_no_longer_afford_it_still_replays(self):
        # A replay is a read of a committed decision, so it cannot start depending on the
        # current balance: 'moves money exactly once' and 'returns the same response'.
        src = self.http.new_account("Drain Then Replay", 1000)
        dst = self.http.new_account("Drain Target", 0)
        key = "drain-" + uuid.uuid4().hex
        created = self.assertJsonResponse(
            self.http.transfer(src["id"], dst["id"], 600, key=key), 201, "first:")
        self.assertJsonResponse(
            self.http.transfer(src["id"], dst["id"], 400), 201, "second, different key:")
        self.assertEqual(0, self.http.balances()[src["id"]])
        r = self.http.transfer(src["id"], dst["id"], 600, key=key)
        self.assertIn(r.status, (200, 201), "I3: the replay must not become a 409: %r" % (r,))
        self.assertEqual(created, r.json(), "I3: same response, same id")
        self.assertEqual(0, self.http.balances()[src["id"]], "I3: money moved once")


class SimultaneousReplay(AcceptanceCase):

    def test_twenty_simultaneous_replays_move_money_exactly_once(self):
        src = self.http.new_account("Simul Source", 10000)
        dst = self.http.new_account("Simul Destination", 0)
        amount = 900
        key = "simul-" + uuid.uuid4().hex
        before = self.http.balances()
        total_before = sum(before.values())

        results = [None] * REPLAYS
        start = threading.Barrier(REPLAYS)

        def fire(i):
            client = Client(self.service.base_url, timeout=30.0)
            start.wait(timeout=30)
            results[i] = client.post(
                "/transfers",
                body={"source_id": src["id"], "destination_id": dst["id"], "amount": amount},
                headers={"Idempotency-Key": key})

        threads = [threading.Thread(target=fire, args=(i,), daemon=True) for i in range(REPLAYS)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)

        self.assertTrue(all(r is not None for r in results),
                        "%d of %d simultaneous replays never returned"
                        % (sum(r is None for r in results), REPLAYS))
        statuses = sorted(r.status for r in results)
        self.assertNotIn(500, statuses,
                         "task: 'never 500'; statuses were %r\n--- server output ---\n%s"
                         % (statuses, self.service.server_log()))
        self.assertTrue(all(s in (200, 201) for s in statuses),
                        "I3: every simultaneous replay of one key and one body must return the "
                        "stored result; statuses were %r" % (statuses,))
        ids = set(r.json()["id"] for r in results)
        self.assertEqual(1, len(ids),
                         "I3: 'the same transfer id' across simultaneous replays; got %r" % (ids,))

        after = self.http.balances()
        self.assertEqual(before[src["id"]] - amount, after[src["id"]],
                         "I3: exactly one money movement out of the source")
        self.assertEqual(before[dst["id"]] + amount, after[dst["id"]],
                         "I3: exactly one money movement into the destination")
        self.assertEqual(total_before, sum(after.values()), "I1: conservation across the replays")
        self.assertNoNegativeBalances()

        # The stored transfer is reachable and singular through the history row too.
        history = self.http.get("/transfers?account_id=" + src["id"]).json()["transfers"]
        self.assertEqual(1, len(history),
                         "I3: 20 replays of one key must leave exactly one transfer; got %r"
                         % (history,))


if __name__ == "__main__":
    unittest.main()
