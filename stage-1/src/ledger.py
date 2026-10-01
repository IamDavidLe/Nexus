"""SQLite-backed account and transfer operations."""

import sqlite3
import time
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from .errors import Conflict, InvalidRequest, NotFound, ServiceUnavailable

MAX_INT64 = 2 ** 63 - 1


def _database_available(operation):
    """Keep SQLite operational failures from becoming generic HTTP 500s."""
    @wraps(operation)
    def wrapped(*args, **kwargs):
        try:
            return operation(*args, **kwargs)
        except sqlite3.OperationalError:
            raise ServiceUnavailable("database is temporarily unavailable") from None
    return wrapped


class Ledger:
    def __init__(self, path):
        self.path = path
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _connect(self):
        con = sqlite3.connect(self.path, isolation_level=None, timeout=10)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA foreign_keys = ON")
        con.execute("PRAGMA busy_timeout = 10000")
        return con

    def _init(self):
        con = self._connect()
        try:
            con.execute("PRAGMA journal_mode = WAL")
            con.executescript("""
                CREATE TABLE IF NOT EXISTS accounts (
                  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                  id TEXT UNIQUE NOT NULL,
                  name TEXT NOT NULL,
                  opening_balance ANY NOT NULL CHECK(typeof(opening_balance) = 'integer' AND opening_balance >= 0),
                  balance ANY NOT NULL CHECK(typeof(balance) = 'integer' AND balance >= 0)
                ) STRICT;
                CREATE TABLE IF NOT EXISTS transfers (
                  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                  id TEXT UNIQUE NOT NULL,
                  source_id TEXT NOT NULL REFERENCES accounts(id),
                  destination_id TEXT NOT NULL REFERENCES accounts(id),
                  amount ANY NOT NULL CHECK(typeof(amount) = 'integer' AND amount >= 1),
                  status TEXT NOT NULL CHECK(status = 'completed'),
                  created_at TEXT NOT NULL,
                  CHECK(source_id <> destination_id)
                ) STRICT;
                CREATE TABLE IF NOT EXISTS ledger_entries (
                  transfer_id TEXT NOT NULL REFERENCES transfers(id),
                  account_id TEXT NOT NULL REFERENCES accounts(id),
                  amount ANY NOT NULL,
                  CHECK(typeof(amount) = 'integer' AND amount <> 0)
                ) STRICT;
                CREATE TABLE IF NOT EXISTS idempotency_keys (
                  key TEXT PRIMARY KEY CHECK(length(key) BETWEEN 1 AND 128),
                  source_id TEXT NOT NULL,
                  destination_id TEXT NOT NULL,
                  amount ANY NOT NULL CHECK(typeof(amount) = 'integer' AND amount >= 1),
                  transfer_id TEXT NOT NULL REFERENCES transfers(id)
                ) STRICT;
            """)
        finally:
            con.close()

    def check_conservation(self, con=None):
        """Return account and entry totals, including opening balances.

        The optional connection is useful for raw-SQL attack tests; callers own
        its lifecycle when supplying one.
        """
        owned = con is None
        con = con or self._connect()
        try:
            rows = con.execute(
                "SELECT id, opening_balance, balance FROM accounts ORDER BY sequence"
            ).fetchall()
            entries = {
                row["account_id"]: row["amount"]
                for row in con.execute(
                    "SELECT account_id, COALESCE(SUM(amount), 0) AS amount "
                    "FROM ledger_entries GROUP BY account_id"
                )
            }
            expected = {
                row["id"]: row["opening_balance"] + entries.get(row["id"], 0)
                for row in rows
            }
            actual = {row["id"]: row["balance"] for row in rows}
            return {
                "balance_total": sum(actual.values()),
                "ledger_total": sum(expected.values()),
                "per_account": expected == actual,
                "total": sum(actual.values()) == sum(expected.values()),
            }
        finally:
            if owned:
                con.close()

    @_database_available
    def create_account(self, name, opening_balance):
        if not isinstance(name, str) or not (1 <= len(name) <= 64) or not name.strip():
            raise InvalidRequest("'name' must contain 1-64 non-whitespace characters")
        if opening_balance < 0:
            raise InvalidRequest("'opening_balance' must be non-negative")
        account = {"id": str(uuid.uuid4()), "name": name, "balance": opening_balance}
        con = self._connect()
        try:
            con.execute("INSERT INTO accounts(id,name,opening_balance,balance) VALUES(?,?,?,?)",
                        (account["id"], name, opening_balance, opening_balance))
            return account
        finally:
            con.close()

    @_database_available
    def accounts(self):
        con = self._connect()
        try:
            return [dict(r) for r in con.execute(
                "SELECT id,name,balance FROM accounts ORDER BY sequence")]
        finally:
            con.close()

    @_database_available
    def account(self, account_id):
        con = self._connect()
        try:
            row = con.execute("SELECT id,name,balance FROM accounts WHERE id=?", (account_id,)).fetchone()
            if row is None:
                raise NotFound("account does not exist")
            return dict(row)
        finally:
            con.close()

    @staticmethod
    def _transfer(row):
        return {k: row[k] for k in ("id", "source_id", "destination_id", "amount", "status", "created_at")}

    @staticmethod
    def _rollback(con):
        """Roll back only when a transaction was actually opened.

        ``BEGIN IMMEDIATE`` itself can fail while another writer owns the
        database.  A second, unconditional ROLLBACK would mask that condition
        and bypass the retry path.
        """
        try:
            con.execute("ROLLBACK")
        except sqlite3.OperationalError:
            pass

    def transfer(self, source_id, destination_id, amount, key):
        for _attempt in range(3):
            con = None
            try:
                con = self._connect()
                con.execute("BEGIN IMMEDIATE")
                prior = con.execute("SELECT * FROM idempotency_keys WHERE key=?", (key,)).fetchone()
                if prior is not None:
                    if (prior["source_id"], prior["destination_id"], prior["amount"]) != (source_id, destination_id, amount):
                        raise Conflict("idempotency_key_reused", "idempotency key was used for a different request")
                    row = con.execute("SELECT * FROM transfers WHERE id=?", (prior["transfer_id"],)).fetchone()
                    con.execute("COMMIT")
                    return self._transfer(row)
                source = con.execute("SELECT balance FROM accounts WHERE id=?", (source_id,)).fetchone()
                destination = con.execute("SELECT balance FROM accounts WHERE id=?", (destination_id,)).fetchone()
                if source is None or destination is None:
                    raise NotFound("source or destination account does not exist")
                if source["balance"] < amount:
                    raise Conflict("insufficient_funds", "source account has insufficient funds")
                if destination["balance"] > MAX_INT64 - amount:
                    raise InvalidRequest("destination balance would exceed 64-bit integer range")
                transfer = {"id": str(uuid.uuid4()), "source_id": source_id,
                            "destination_id": destination_id, "amount": amount,
                            "status": "completed", "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
                debit = con.execute(
                    "UPDATE accounts SET balance=balance-? WHERE id=? AND balance>=?",
                    (amount, source_id, amount),
                )
                if debit.rowcount != 1:
                    raise Conflict("insufficient_funds", "source account has insufficient funds")
                con.execute("UPDATE accounts SET balance=balance+? WHERE id=?", (amount, destination_id))
                con.execute(
                    "INSERT INTO transfers(id,source_id,destination_id,amount,status,created_at) VALUES(?,?,?,?,?,?)",
                    tuple(transfer.values()),
                )
                con.execute("INSERT INTO ledger_entries VALUES(?,?,?)", (transfer["id"], source_id, -amount))
                con.execute("INSERT INTO ledger_entries VALUES(?,?,?)", (transfer["id"], destination_id, amount))
                con.execute("INSERT INTO idempotency_keys VALUES(?,?,?,?,?)", (key, source_id, destination_id, amount, transfer["id"]))
                con.execute("COMMIT")
                return transfer
            except Conflict:
                if con is not None:
                    self._rollback(con)
                raise
            except NotFound:
                if con is not None:
                    self._rollback(con)
                raise
            except InvalidRequest:
                if con is not None:
                    self._rollback(con)
                raise
            except sqlite3.OperationalError:
                if con is not None:
                    self._rollback(con)
                if _attempt == 2:
                    raise ServiceUnavailable("database is busy; retry the request") from None
                time.sleep(0.02 * (_attempt + 1))
            except Exception:
                if con is not None:
                    self._rollback(con)
                raise
            finally:
                if con is not None:
                    con.close()

    @_database_available
    def get_transfer(self, transfer_id):
        con = self._connect()
        try:
            row = con.execute("SELECT * FROM transfers WHERE id=?", (transfer_id,)).fetchone()
            if row is None:
                raise NotFound("transfer does not exist")
            return self._transfer(row)
        finally:
            con.close()

    @_database_available
    def history(self, account_id):
        con = self._connect()
        try:
            rows = con.execute("SELECT * FROM transfers WHERE source_id=? OR destination_id=? ORDER BY sequence DESC", (account_id, account_id))
            return [self._transfer(r) for r in rows]
        finally:
            con.close()
