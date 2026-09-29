#!/usr/bin/env python3
"""replay.py - generic retry-safety driver (BLUEPRINT step 47). Standard library only.

Sends the same request K times, optionally carrying one request-key header whose name is
passed in, then reports whether every response was identical. A retry-safe write returns
the same result every time and applies its effect once; the Breaker confirms the "once"
against stored state.

Template: same JSON format as race.py (method, url, headers, body). Placeholders are filled
once, so every send is byte-for-byte the same request.

Usage:
  python tools/replay.py --template t.json --count 20 --key-header Idempotency-Key --out r.jsonl
  python tools/replay.py --template t.json --count 20 --parallel --key-header Idempotency-Key --out r.jsonl
  python tools/replay.py --template t.json --count 5 --out r.jsonl     # no key: what does a bare repeat do?

Exit code: 0 if every response had the same status and body, 1 if they differed or any
request failed at the transport level, 2 on usage errors. A difference is not automatically
a bug (a second create may rightly be refused); the Breaker judges it against the task.
"""
import argparse
import hashlib
import json
import random
import sys
import threading
import uuid
from collections import Counter

sys.path.insert(0, __import__("os").path.dirname(__file__))
from race import fill, send  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--template", required=True)
    ap.add_argument("--count", type=int, required=True, help="how many times to send it")
    ap.add_argument("--key-header", help="name of the request-key header the target supports")
    ap.add_argument("--key", help="key value (default: one random UUID for all sends)")
    ap.add_argument("--parallel", action="store_true", help="send all at once instead of one by one")
    ap.add_argument("--out", required=True, help="results file (JSON lines)")
    ap.add_argument("--timeout", type=float, default=30.0)
    ap.add_argument("--ignore", action="append", default=[],
                    help="JSON field to ignore when comparing bodies (repeatable), e.g. a timestamp")
    args = ap.parse_args()
    if args.count < 1:
        ap.error("--count must be at least 1")

    with open(args.template, encoding="utf-8") as f:
        template = json.load(f)
    # fill placeholders once so every send is identical
    template = fill(template, {"worker": 0, "round": 0, "seq": 0, "uuid": uuid.uuid4(),
                               "rand": random.randint(0, 2**31)})
    if args.key_header:
        template.setdefault("headers", {})[args.key_header] = args.key or str(uuid.uuid4())

    results = [None] * args.count

    def run(i):
        results[i] = send(template, {"worker": i, "round": 0, "seq": i}, args.timeout)

    if args.parallel:
        threads = [threading.Thread(target=run, args=(i,)) for i in range(args.count)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
    else:
        for i in range(args.count):
            run(i)

    def fingerprint(body):
        try:
            data = json.loads(body)
            if isinstance(data, dict):
                for field in args.ignore:
                    data.pop(field, None)
            body = json.dumps(data, sort_keys=True)
        except (ValueError, TypeError):
            pass
        return hashlib.sha256((body or "").encode()).hexdigest()[:12]

    with open(args.out, "w", encoding="utf-8") as out:
        for rec in results:
            rec["fingerprint"] = fingerprint(rec.get("body"))
            out.write(json.dumps(rec) + "\n")

    statuses = Counter(r["status"] for r in results)
    prints = Counter(r["fingerprint"] for r in results)
    print("sent %d %s, key header: %s" % (args.count, "in parallel" if args.parallel else "in sequence",
                                           args.key_header or "none"))
    print("statuses: %s" % dict(statuses))
    print("distinct bodies: %d" % len(prints))
    identical = len(statuses) == 1 and len(prints) == 1 and None not in statuses
    print("IDENTICAL" if identical else "DIFFERENT")
    sys.exit(0 if identical else 1)


if __name__ == "__main__":
    main()
