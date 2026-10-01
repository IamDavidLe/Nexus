"""Regression tests for slow-client and connection-admission limits."""

import socket
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager

from src.http_app import build_router, make_server
from tests.support import request


@contextmanager
def running_limited(router=None, timeout=0.15, deadline=1, max_connections=4):
    server = make_server(
        "127.0.0.1",
        0,
        router,
        request_timeout=timeout,
        request_deadline=deadline,
        max_concurrent_connections=max_connections,
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server, "http://127.0.0.1:%d" % server.server_address[1]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def open_socket(server):
    sock = socket.create_connection(server.server_address, timeout=1)
    sock.settimeout(1)
    return sock


def assert_closed(testcase, sock):
    try:
        data = sock.recv(4096)
    except ConnectionResetError:
        return
    testcase.assertEqual(data, b"")


def receive_until_closed(sock):
    chunks = []
    while True:
        try:
            data = sock.recv(4096)
        except ConnectionResetError:
            break
        if not data:
            break
        chunks.append(data)
    return b"".join(chunks)


def wait_for_free_slot(testcase, server):
    deadline = time.monotonic() + 1
    while time.monotonic() < deadline:
        if server._connection_slots.acquire(blocking=False):
            server._connection_slots.release()
            return
        time.sleep(0.01)
    testcase.fail("connection slot was not released")


class SlowClientLimitTest(unittest.TestCase):
    def test_default_limit_serves_fifty_concurrent_health_checks(self):
        with running_limited(timeout=1, max_connections=64) as (_server, base):
            with ThreadPoolExecutor(max_workers=50) as pool:
                responses = list(pool.map(lambda _unused: request(base + "/healthz"), range(50)))
        self.assertEqual([response.status for response in responses], [200] * 50)
        self.assertEqual(
            [response.body for response in responses], [b'{"status":"ok"}'] * 50
        )

    def test_incomplete_request_line_times_out_without_blocking_healthz(self):
        with running_limited() as (server, base):
            sock = open_socket(server)
            try:
                sock.sendall(b"GET /healthz HTTP/1.")
                assert_closed(self, sock)
                response = request(base + "/healthz")
            finally:
                sock.close()
        self.assertEqual(response.status, 200)
        self.assertEqual(response.body, b'{"status":"ok"}')

    def test_drip_fed_request_line_hits_absolute_deadline(self):
        with running_limited(timeout=1, deadline=0.2) as (server, base):
            sock = open_socket(server)
            try:
                for byte in b"GET":
                    try:
                        sock.sendall(bytes([byte]))
                    except OSError:
                        break
                    time.sleep(0.07)
                assert_closed(self, sock)
                response = request(base + "/healthz")
            finally:
                sock.close()
        self.assertEqual(response.status, 200)
        self.assertEqual(response.body, b'{"status":"ok"}')

    def test_incomplete_header_times_out_without_blocking_healthz(self):
        with running_limited() as (server, base):
            sock = open_socket(server)
            try:
                sock.sendall(b"GET /healthz HTTP/1.1\r\nHost: example\r\nX-Slow: ")
                assert_closed(self, sock)
                response = request(base + "/healthz")
            finally:
                sock.close()
        self.assertEqual(response.status, 200)
        self.assertEqual(response.body, b'{"status":"ok"}')

    def test_incomplete_body_returns_timeout_and_keeps_healthz_available(self):
        with running_limited() as (server, base):
            sock = open_socket(server)
            try:
                sock.sendall(
                    b"GET /healthz HTTP/1.1\r\nHost: example\r\nContent-Length: 1\r\n\r\n"
                )
                response = receive_until_closed(sock)
                self.assertIn(b" 408 ", response)
                self.assertIn(b'"error":"request_timeout"', response)
                response = request(base + "/healthz")
            finally:
                sock.close()
        self.assertEqual(response.status, 200)
        self.assertEqual(response.body, b'{"status":"ok"}')

    def test_admission_limit_rejects_extra_connection_and_recovers(self):
        entered = threading.Event()
        release = threading.Event()
        router = build_router()

        def hold(_request):
            entered.set()
            release.wait(timeout=1)
            return 200, {"status": "released"}

        router.add("GET", "/hold", hold)
        with running_limited(router, timeout=1, max_connections=1) as (server, base):
            held = open_socket(server)
            extra = None
            try:
                held.sendall(
                    b"GET /hold HTTP/1.1\r\nHost: example\r\nConnection: close\r\n\r\n"
                )
                self.assertTrue(entered.wait(timeout=1))
                extra = open_socket(server)
                extra.sendall(b"GET /healthz HTTP/1.1\r\nHost: example\r\n\r\n")
                assert_closed(self, extra)
                release.set()
                self.assertIn(b" 200 ", held.recv(4096))
                wait_for_free_slot(self, server)
                response = request(base + "/healthz")
            finally:
                release.set()
                held.close()
                if extra is not None:
                    extra.close()
        self.assertEqual(response.status, 200)
        self.assertEqual(response.body, b'{"status":"ok"}')


if __name__ == "__main__":
    unittest.main()
