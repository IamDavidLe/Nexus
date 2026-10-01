"""Failure-mode tests for the durable transfer path."""

import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from src.errors import ServiceUnavailable
from src.ledger import Ledger


class LedgerFailureTest(unittest.TestCase):
    def test_exhausted_write_lock_retries_returns_controlled_error(self):
        """Lock exhaustion must not escape as a 500 from the HTTP handler."""
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Ledger(tmp + "/app.db")
            with patch.object(ledger, "_connect", side_effect=sqlite3.OperationalError("database is locked")), \
                 patch("src.ledger.time.sleep"):
                with self.assertRaises(ServiceUnavailable) as raised:
                    ledger.transfer("source", "destination", 1, "key")
        self.assertEqual(503, raised.exception.status)
        self.assertEqual("temporarily_unavailable", raised.exception.error)

    def test_read_operation_db_failure_is_also_controlled(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Ledger(tmp + "/app.db")
            with patch.object(ledger, "_connect", side_effect=sqlite3.OperationalError("database is locked")):
                with self.assertRaises(ServiceUnavailable) as raised:
                    ledger.accounts()
        self.assertEqual(503, raised.exception.status)

    def test_raw_sql_cannot_store_text_or_float_money_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Ledger(tmp + "/app.db")
            con = ledger._connect()
            try:
                for values in (("text-opening", "name", "1", 1),
                               ("float-opening", "name", 1.0, 1),
                               ("text-balance", "name", 1, "1"),
                               ("float-balance", "name", 1, 1.0)):
                    with self.subTest(account=values[0]), self.assertRaises(sqlite3.IntegrityError):
                        con.execute("INSERT INTO accounts(id,name,opening_balance,balance) VALUES(?,?,?,?)", values)

                con.execute("INSERT INTO accounts(id,name,opening_balance,balance) VALUES('source','s',1,1)")
                con.execute("INSERT INTO accounts(id,name,opening_balance,balance) VALUES('destination','d',0,0)")
                for amount in ("1", 1.0):
                    with self.subTest(transfer_amount=amount), self.assertRaises(sqlite3.IntegrityError):
                        con.execute(
                            "INSERT INTO transfers(id,source_id,destination_id,amount,status,created_at) VALUES(?,?,?,?,?,?)",
                            ("transfer-" + str(amount), "source", "destination", amount, "completed", "2026-01-01T00:00:00Z"),
                        )
            finally:
                con.close()


if __name__ == "__main__":
    unittest.main()
