"""Container entrypoint: start the HTTP service and serve until stopped.

Kept deliberately thin so `/healthz` answers within a second of process start
(A1: port 8080 by default, overridable with ``PORT``).
"""

import os
import sys

if __package__:
    from .http_app import make_server
    from .ledger import Ledger
else:  # launched as `python src/main.py` rather than `python -m src.main`
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from src.http_app import make_server
    from src.ledger import Ledger


def main(argv=None):
    port_text = os.environ.get("PORT", "8080")
    try:
        port = int(port_text)
    except ValueError:
        sys.stderr.write("PORT must be an integer, got %r\n" % (port_text,))
        return 2
    host = os.environ.get("HOST", "0.0.0.0")
    server = make_server(host, port, ledger=Ledger(os.environ.get("DB_PATH", "/data/app.db")))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
