"""Acceptance harness for stage 1.

Written by the Verifier from `tasks/stage-1.task.md` alone. It must not import the
product's modules: everything here talks to the service over HTTP, exactly as the
task's interface contract describes it, or reads the SQLite file the service was
told to use. That keeps the acceptance suite independent of how the Builder chose
to structure the code (definition-of-done.md item 2).

Server launch (assumption A15, see stage-1/ASSUMPTIONS.md):
  1. `STAGE1_SERVER_CMD` if set, split with shlex and run without a shell.
  2. otherwise the `CMD`/`ENTRYPOINT` of `stage-1/Dockerfile`, which is the command
     the task itself makes authoritative ("docker run --network none must start the
     service").
  3. otherwise the first of app.py, server.py, main.py, run.py (also under src/),
     or a package directory containing __main__.py.

If no entry point can be found the checks raise SkipTest, so the suite is green with
skips before any product code exists. Set `STAGE1_REQUIRE_SERVER=1` to turn those
skips into hard failures; every Verifier sign-off run sets it.
"""

from __future__ import annotations

import json
import os
import shlex
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

STAGE_DIR = Path(__file__).resolve().parent.parent
TASK_FILE = STAGE_DIR.parent / "tasks" / "stage-1.task.md"

# from the task: "Starts and answers /healthz within 5 seconds"
START_TIMEOUT_S = 5.0
REQUIRE_SERVER = os.environ.get("STAGE1_REQUIRE_SERVER") == "1"

_CANDIDATES = (
    "app.py", "server.py", "main.py", "run.py",
    "src/app.py", "src/server.py", "src/main.py", "src/run.py",
)


def _dockerfile_command():
    dockerfile = STAGE_DIR / "Dockerfile"
    if not dockerfile.is_file():
        return None
    entry = []
    cmd = []
    for raw in dockerfile.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        upper = line.upper()
        for keyword, sink in (("ENTRYPOINT", "entry"), ("CMD", "cmd")):
            if not upper.startswith(keyword + " ") and not upper.startswith(keyword + "["):
                continue
            payload = line[len(keyword):].strip()
            try:
                parsed = json.loads(payload)
                parts = [str(p) for p in parsed] if isinstance(parsed, list) else shlex.split(payload)
            except (json.JSONDecodeError, ValueError):
                parts = shlex.split(payload)
            if sink == "entry":
                entry = parts
            else:
                cmd = parts
            break
    parts = entry + cmd
    if not parts:
        return None
    # the image runs python from PATH; locally use this interpreter
    if parts[0] in ("python", "python3", "/usr/bin/python", "/usr/local/bin/python", "/usr/bin/python3"):
        parts[0] = sys.executable
    return parts


def _candidate_command():
    for rel in _CANDIDATES:
        path = STAGE_DIR / rel
        if path.is_file():
            return [sys.executable, str(path)]
    for child in sorted(STAGE_DIR.iterdir()):
        if child.is_dir() and child.name not in ("tests", "evidence", ".git") \
                and (child / "__main__.py").is_file():
            return [sys.executable, "-m", child.name]
    return None


def server_command():
    override = os.environ.get("STAGE1_SERVER_CMD")
    if override:
        parts = shlex.split(override)
        if parts and parts[0] in ("python", "python3"):
            parts[0] = sys.executable
        return parts
    return _dockerfile_command() or _candidate_command()


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


class Response:
    """A response with the body kept as raw bytes, so shape checks are exact."""

    def __init__(self, status, headers, body):
        self.status = status
        self.headers = headers
        self.body = body

    @property
    def content_type(self):
        return (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()

    def json(self):
        return json.loads(self.body.decode("utf-8"))

    @property
    def text(self):
        return self.body.decode("utf-8", errors="replace")

    def __repr__(self):
        return "<Response %s %r>" % (self.status, self.body[:200])


class Client:
    """Minimal HTTP client. `raw_body` is sent byte for byte: the task requires
    rejecting `1.5`, `"10"`, `1e2` and `true` as amounts, and those are literals a
    json.dumps round trip would hide."""

    def __init__(self, base, timeout=15.0):
        self.base = base.rstrip("/")
        self.timeout = timeout

    def request(self, method, path, body=None, raw_body=None, headers=None, timeout=None):
        data = raw_body
        hdrs = dict(headers or {})
        if data is None and body is not None:
            data = json.dumps(body).encode("utf-8")
        if data is not None:
            hdrs.setdefault("Content-Type", "application/json")
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=hdrs)
        try:
            with urllib.request.urlopen(req, timeout=timeout or self.timeout) as resp:
                return Response(resp.status, resp.headers, resp.read())
        except urllib.error.HTTPError as e:
            return Response(e.code, e.headers, e.read())

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def post(self, path, **kw):
        return self.request("POST", path, **kw)

    # --- contract helpers -------------------------------------------------
    def create_account(self, name, opening_balance):
        return self.post("/accounts", body={"name": name, "opening_balance": opening_balance})

    def new_account(self, name, opening_balance):
        r = self.create_account(name, opening_balance)
        if r.status != 201:
            raise AssertionError("fixture account creation failed: %r" % (r,))
        return r.json()

    def transfer(self, source_id, destination_id, amount, key="auto", raw_body=None):
        headers = {}
        if key == "auto":
            key = "acc-" + os.urandom(8).hex()
        if key is not None:
            headers["Idempotency-Key"] = key
        body = None if raw_body is not None else {
            "source_id": source_id, "destination_id": destination_id, "amount": amount}
        return self.post("/transfers", body=body, raw_body=raw_body, headers=headers)

    def balances(self):
        r = self.get("/accounts")
        if r.status != 200:
            raise AssertionError("GET /accounts failed: %r" % (r,))
        return dict((a["id"], a["balance"]) for a in r.json()["accounts"])

    def total(self):
        return sum(self.balances().values())


class Service:
    """One server process with its own port and its own fresh database file."""

    def __init__(self):
        self.cmd = server_command()
        self.port = free_port()
        self._tmp = tempfile.TemporaryDirectory(prefix="stage1-acceptance-")
        self.db_path = Path(self._tmp.name) / "app.db"
        self.proc = None
        self.log_path = Path(self._tmp.name) / "server.log"
        self._log = None
        self.started_in = None

    @property
    def base_url(self):
        return "http://127.0.0.1:%d" % self.port

    def start(self):
        if not self.cmd:
            raise unittest.SkipTest(
                "no stage-1 server entry point found yet (looked at STAGE1_SERVER_CMD, "
                "stage-1/Dockerfile CMD/ENTRYPOINT, then app.py/server.py/main.py/run.py)")
        env = dict(os.environ)
        env.update({
            "PORT": str(self.port),
            "DB_PATH": str(self.db_path),
            "PYTHONUNBUFFERED": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
        })
        env.pop("STAGE1_SERVER_CMD", None)
        self._log = open(self.log_path, "wb")
        t0 = time.monotonic()
        self.proc = subprocess.Popen(
            self.cmd, cwd=str(STAGE_DIR), env=env,
            stdout=self._log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL)
        client = Client(self.base_url)
        deadline = t0 + START_TIMEOUT_S
        while time.monotonic() < deadline:
            if self.proc.poll() is not None:
                raise AssertionError(
                    "server exited with %s before answering /healthz.\ncommand: %s\n"
                    "--- server output ---\n%s" % (self.proc.returncode, self.cmd, self.server_log()))
            try:
                r = client.get("/healthz", timeout=1.0)
                if r.status == 200:
                    self.started_in = time.monotonic() - t0
                    return client
            except OSError:
                pass
            time.sleep(0.05)
        raise AssertionError(
            "/healthz did not answer 200 within %.1fs (task: 'Starts and answers /healthz "
            "within 5 seconds').\ncommand: %s\n--- server output ---\n%s"
            % (START_TIMEOUT_S, self.cmd, self.server_log()))

    def server_log(self):
        try:
            return self.log_path.read_text(encoding="utf-8", errors="replace")[-4000:]
        except OSError:
            return "<no server output captured>"

    def stop(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=10)
        if self._log:
            self._log.close()
            self._log = None

    def cleanup(self):
        self.stop()
        try:
            self._tmp.cleanup()
        except OSError:
            pass

    # --- storage-layer inspection ----------------------------------------
    def db(self):
        """Read-only handle on the file the service was told to use. Used only for the
        storage-layer requirements the task states in words ('CHECK (balance >= 0)',
        'Enable WAL mode', 'exactly two ledger entries ... in the same database
        transaction'), never to reach into application code."""
        if not self.db_path.exists():
            raise AssertionError("the service created no database at DB_PATH=%s" % self.db_path)
        con = sqlite3.connect("file:%s?mode=ro" % self.db_path.as_posix(), uri=True, timeout=10)
        con.row_factory = sqlite3.Row
        return con

    def table_ddl(self):
        con = self.db()
        try:
            rows = con.execute(
                "SELECT name, sql FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%'").fetchall()
        finally:
            con.close()
        return dict((r["name"], r["sql"] or "") for r in rows)

    def row_counts(self):
        counts = {}
        con = self.db()
        try:
            names = [r["name"] for r in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
            for name in names:
                counts[name] = con.execute('SELECT COUNT(*) FROM "%s"' % name).fetchone()[0]
        finally:
            con.close()
        return counts

    def rows(self, table):
        con = self.db()
        try:
            return [dict(r) for r in con.execute('SELECT * FROM "%s"' % table).fetchall()]
        finally:
            con.close()

    def journal_mode(self):
        con = self.db()
        try:
            return str(con.execute("PRAGMA journal_mode").fetchone()[0]).lower()
        finally:
            con.close()


class AcceptanceCase(unittest.TestCase):
    """Base case: one fresh service per test class."""

    @classmethod
    def setUpClass(cls):
        cls.service = Service()
        try:
            cls.http = cls.service.start()
        except unittest.SkipTest:
            cls.service.cleanup()
            if REQUIRE_SERVER:
                raise AssertionError(
                    "STAGE1_REQUIRE_SERVER=1 and no stage-1 server entry point was found")
            raise
        except BaseException:
            cls.service.cleanup()
            raise

    @classmethod
    def tearDownClass(cls):
        cls.service.cleanup()

    # --- shared assertions ------------------------------------------------
    def assertJsonResponse(self, resp, status, msg=""):
        self.assertEqual(status, resp.status, "%s expected %s, got %r" % (msg, status, resp))
        self.assertEqual("application/json", resp.content_type,
                         "%s task: 'All request and response bodies are JSON, Content-Type: "
                         "application/json'; got %r" % (msg, resp.headers.get("Content-Type")))
        return resp.json()

    def assertErrorBody(self, resp, status, error, detail=False):
        payload = self.assertJsonResponse(resp, status, "error %s:" % error)
        self.assertIsInstance(payload, dict, "error body must be a JSON object, got %r" % (payload,))
        self.assertEqual(error, payload.get("error"),
                         'task prints {"error":"%s"}; got %r' % (error, payload))
        if detail:
            self.assertIn("detail", payload,
                          'task prints {"error":"invalid_request","detail":"..."}; got %r' % (payload,))
            self.assertIsInstance(payload["detail"], str)
        return payload

    def assertIntegerAmount(self, value, label):
        """The task: 'All monetary amounts are integers in minor units (cents)' and
        I5 forbids floats anywhere in the money path, including the response."""
        self.assertNotIsInstance(value, bool, "%s must be an integer, not a bool: %r" % (label, value))
        self.assertIsInstance(value, int, "%s must be a JSON integer, got %s %r"
                              % (label, type(value).__name__, value))

    def assertNoNegativeBalances(self):
        """I2 - 'No account balance is ever negative, at any instant'."""
        for account_id, balance in self.http.balances().items():
            self.assertGreaterEqual(balance, 0, "I2 violated: account %s balance %s"
                                    % (account_id, balance))
