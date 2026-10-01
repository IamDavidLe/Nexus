"""S1-01 criteria 1 and 2: `/healthz` shape, and answering within 1s of start."""

import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from tests.support import request, running

ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class HealthTest(unittest.TestCase):
    def test_returns_ok_json(self):
        with running() as base:
            response = request(base + "/healthz")
        self.assertEqual(response.status, 200)
        self.assertEqual(response.body, b'{"status":"ok"}')
        self.assertEqual(response.headers["Content-Type"], "application/json")

    def test_healthz_rejects_post_but_stays_json(self):
        with running() as base:
            response = request(base + "/healthz", method="POST")
        self.assertEqual(response.status, 405)
        self.assertEqual(response.json()["error"], "method_not_allowed")


class HealthTimingTest(unittest.TestCase):
    """Spawn the real entrypoint and time spawn -> first successful answer."""

    def test_answers_within_one_second_of_process_start(self):
        port = free_port()
        with tempfile.TemporaryDirectory(prefix="stage1-health-") as tmp:
            env = dict(os.environ, PORT=str(port), HOST="127.0.0.1", DB_PATH=str(Path(tmp) / "app.db"))
            self._assert_entrypoint_health(env, port)

    def _assert_entrypoint_health(self, env, port):
        env.pop("PYTHONDONTWRITEBYTECODE", None)
        url = "http://127.0.0.1:%d/healthz" % (port,)

        started = time.monotonic()
        proc = subprocess.Popen(
            [sys.executable, "-m", "src.main"],
            cwd=str(ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        try:
            elapsed = None
            deadline = started + 10
            while time.monotonic() < deadline:
                try:
                    with urllib.request.urlopen(url, timeout=1) as resp:
                        if resp.status == 200 and resp.read() == b'{"status":"ok"}':
                            elapsed = time.monotonic() - started
                            break
                except (urllib.error.URLError, OSError):
                    time.sleep(0.01)
            self.assertIsNotNone(elapsed, "service never answered /healthz")
            self.assertLess(
                elapsed, 1.0, "answered /healthz after %.3fs" % (elapsed,)
            )
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:  # pragma: no cover
                proc.kill()
            for stream in (proc.stdout, proc.stderr):
                if stream is not None:
                    stream.close()


if __name__ == "__main__":
    unittest.main()
