"""Shared test helpers: run the real server in-process and talk HTTP to it."""

import json
import threading
import urllib.error
import urllib.request
from contextlib import contextmanager

from src.http_app import make_server


class Response:
    def __init__(self, status, headers, body):
        self.status = status
        self.headers = headers
        self.body = body

    def json(self):
        return json.loads(self.body.decode("utf-8"))


@contextmanager
def running(router=None):
    """Serve `router` on an ephemeral port for the duration of the block."""
    server = make_server("127.0.0.1", 0, router)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield "http://127.0.0.1:%d" % (server.server_address[1],)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def request(url, method="GET", body=None, headers=None):
    """Perform one request and return a :class:`Response`, errors included."""
    req = urllib.request.Request(url, data=body, method=method)
    for name, value in (headers or {}).items():
        req.add_header(name, value)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return Response(resp.status, dict(resp.headers), resp.read())
    except urllib.error.HTTPError as exc:
        with exc:
            return Response(exc.code, dict(exc.headers), exc.read())


def post_json(url, payload_bytes, content_type="application/json"):
    return request(
        url, method="POST", body=payload_bytes, headers={"Content-Type": content_type}
    )


def probe_router():
    """The product router plus a test-only route that exercises the parser.

    S1-01 has no endpoint that stores money yet, so the chokepoint is driven
    over real HTTP through this route. It lives in the tests, never in `src`.
    """
    from src.http_app import build_router
    from src.money import require_integer

    def probe(request):
        return 200, {"amount": require_integer(request.json(), "amount")}

    router = build_router()
    router.add("POST", "/_probe/amount", probe)
    return router
