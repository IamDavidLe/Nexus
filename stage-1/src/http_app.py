"""HTTP plumbing: routing, JSON request and response handling.

One connection per thread (A13), HTTP/1.1 with an explicit ``Content-Length`` on
every response. Handlers receive a :class:`Request` and return
``(status, payload)``; every error they raise that is an :class:`ApiError`
becomes the JSON body the interface contract names.
"""

import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from .errors import ApiError, InvalidRequest, MethodNotAllowed, NotFound
from .money import parse_json_object

JSON_CONTENT_TYPE = "application/json"
#: A body larger than this is refused before it is read into memory.
MAX_BODY_BYTES = 64 * 1024

_SEGMENT = re.compile(r"\{([a-z_]+)\}")


class Request:
    """One decoded request: path parameters, query string and JSON body."""

    def __init__(self, method, path, params, query, headers, raw_body):
        self.method = method
        self.path = path
        self.params = params
        self.query = query
        self.headers = headers
        self.raw_body = raw_body

    def json(self):
        """The body as a JSON object, or :class:`InvalidRequest`."""
        content_type = self.headers.get("Content-Type", "")
        media_type = content_type.split(";", 1)[0].strip().lower()
        if media_type != JSON_CONTENT_TYPE:
            raise InvalidRequest(
                "Content-Type must be %s, got %r" % (JSON_CONTENT_TYPE, content_type)
            )
        return parse_json_object(self.raw_body)


def _compile(pattern):
    regex = "^" + _SEGMENT.sub(r"(?P<\1>[^/]+)", pattern) + "$"
    return re.compile(regex)


class Router:
    """Exact and ``{param}`` path routes, grouped by path so 405 can list Allow."""

    def __init__(self):
        self._routes = []

    def add(self, method, pattern, handler):
        for entry in self._routes:
            if entry["pattern"] == pattern:
                entry["handlers"][method.upper()] = handler
                return
        self._routes.append(
            {
                "pattern": pattern,
                "regex": _compile(pattern),
                "handlers": {method.upper(): handler},
            }
        )

    def resolve(self, method, path):
        """Return ``(handler, params)``, or raise ``NotFound`` / ``MethodNotAllowed``."""
        for entry in self._routes:
            match = entry["regex"].match(path)
            if match is None:
                continue
            handlers = entry["handlers"]
            handler = handlers.get(method.upper())
            if handler is None:
                raise MethodNotAllowed(
                    sorted(handlers),
                    "%s is not supported on %s" % (method.upper(), path),
                )
            return handler, match.groupdict()
        raise NotFound("no route for %s" % (path,))


def health(request):
    return 200, {"status": "ok"}


def build_router():
    """The product router. Tests add their own probe routes on top of it."""
    router = Router()
    router.add("GET", "/healthz", health)
    return router


class JsonHandler(BaseHTTPRequestHandler):
    """Turns raw HTTP into :class:`Request` objects and JSON responses."""

    protocol_version = "HTTP/1.1"
    server_version = "nexus-stage1"
    sys_version = ""

    def log_message(self, fmt, *args):  # pragma: no cover - quiet by design
        pass

    def _read_body(self):
        raw_length = self.headers.get("Content-Length")
        if raw_length is None:
            return b""
        try:
            length = int(raw_length)
        except ValueError:
            raise InvalidRequest("Content-Length is not an integer") from None
        if length < 0:
            raise InvalidRequest("Content-Length is negative")
        if length > MAX_BODY_BYTES:
            raise InvalidRequest("request body is too large")
        return self.rfile.read(length)

    def _respond(self, status, payload, extra_headers=()):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", JSON_CONTENT_TYPE)
        self.send_header("Content-Length", str(len(body)))
        for name, value in extra_headers:
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _respond_error(self, status, payload, extra_headers=()):
        """An error may arrive before the body was read, so the connection ends."""
        headers = list(extra_headers) + [("Connection", "close")]
        self._respond(status, payload, headers)

    def _dispatch(self, method):
        parts = urlsplit(self.path)
        try:
            handler, params = self.server.router.resolve(method, parts.path)
            request = Request(
                method=method,
                path=parts.path,
                params=params,
                query=parse_qs(parts.query, keep_blank_values=True),
                headers=self.headers,
                raw_body=self._read_body(),
            )
            status, payload = handler(request)
        except MethodNotAllowed as exc:
            self._respond_error(
                exc.status, exc.body(), [("Allow", ", ".join(exc.allowed))]
            )
        except ApiError as exc:
            self._respond_error(exc.status, exc.body())
        except Exception:  # pragma: no cover - last resort, never a silent 200
            self.log_error("unhandled error on %s %s", method, self.path)
            self._respond_error(500, {"error": "internal_error"})
        else:
            self._respond(status, payload)

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_PUT(self):
        self._dispatch("PUT")

    def do_PATCH(self):
        self._dispatch("PATCH")

    def do_DELETE(self):
        self._dispatch("DELETE")

    def do_HEAD(self):
        self._dispatch("GET")


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, router):
        self.router = router
        super().__init__(address, JsonHandler)


def make_server(host="0.0.0.0", port=8080, router=None):
    return Server((host, port), router if router is not None else build_router())
