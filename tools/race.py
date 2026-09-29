#!/usr/bin/env python3
"""race.py - generic concurrency driver (BLUEPRINT step 46). Standard library only.

Fires N requests at the same instant, M rounds in a row, and records every response.
It has no domain logic: the Breaker writes the request template during a run and checks
the invariant against stored state afterwards.

Template (JSON):
  {
    "method": "POST",
    "url": "http://127.0.0.1:8080/things",
    "headers": {"Content-Type": "application/json"},
    "body": {"name": "item-{{worker}}"}
  }
Placeholders, replaced in url, header values and body:
  {{worker}}  worker index in the round (0..N-1)
  {{round}}   round index (0..M-1)
  {{seq}}     global request number
  {{uuid}}    a fresh random UUID per request
  {{rand}}    a random integer per request

Usage:
  python tools/race.py --template t.json --workers 50 --rounds 5 --out results.jsonl

Writes one JSON line per request and prints a per-round summary of status counts.
Exit code: 0 when every request got a response, 1 if any failed at the transport level
(timeouts, refused connections), 2 on usage errors. Status codes are data, not failures:
judging them is the Breaker's job.
"""
import argparse
import json
import random
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from collections import Counter


def fill(value, ctx):
    if isinstance(value, str):
        for key, val in ctx.items():
            value = value.replace("{{%s}}" % key, str(val))
        return value
    if isinstance(value, dict):
        return {k: fill(v, ctx) for k, v in value.items()}
    if isinstance(value, list):
        return [fill(v, ctx) for v in value]
    return value


def send(template, ctx, timeout):
    t = fill(template, ctx)
    body = t.get("body")
    data = None
    if body is not None:
        data = (body if isinstance(body, str) else json.dumps(body)).encode()
    req = urllib.request.Request(t["url"], data=data, method=t.get("method", "GET"),
                                 headers=t.get("headers", {}))
    start = time.perf_counter()
    rec = {"worker": ctx["worker"], "round": ctx["round"], "seq": ctx["seq"]}
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            rec["status"] = resp.status
            rec["body"] = resp.read(4096).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:  # non-2xx still is a response
        rec["status"] = e.code
        rec["body"] = e.read(4096).decode("utf-8", "replace")
    except Exception as e:  # transport failure
        rec["status"] = None
        rec["error"] = "%s: %s" % (type(e).__name__, e)
    rec["ms"] = round((time.perf_counter() - start) * 1000, 2)
    return rec


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--template", required=True)
    ap.add_argument("--workers", type=int, required=True, help="parallel requests per round")
    ap.add_argument("--rounds", type=int, default=1, help="rounds to run back to back")
    ap.add_argument("--out", required=True, help="results file (JSON lines)")
    ap.add_argument("--timeout", type=float, default=30.0, help="per-request timeout, seconds")
    args = ap.parse_args()
    if args.workers < 1 or args.rounds < 1:
        ap.error("--workers and --rounds must be at least 1")

    with open(args.template, encoding="utf-8") as f:
        template = json.load(f)
    if "url" not in template:
        ap.error("template needs a url")

    seq = 0
    failed = 0
    with open(args.out, "w", encoding="utf-8") as out:
        for rnd in range(args.rounds):
            barrier = threading.Barrier(args.workers)
            results = [None] * args.workers
            ctxs = []
            for w in range(args.workers):
                ctxs.append({"worker": w, "round": rnd, "seq": seq,
                             "uuid": uuid.uuid4(), "rand": random.randint(0, 2**31)})
                seq += 1

            def run(w):
                barrier.wait()  # release every worker at the same instant
                results[w] = send(template, ctxs[w], args.timeout)

            threads = [threading.Thread(target=run, args=(w,)) for w in range(args.workers)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
            for rec in results:
                out.write(json.dumps(rec) + "\n")
            counts = Counter(r["status"] for r in results)
            failed += counts.get(None, 0)
            summary = ", ".join("%s x%d" % (k if k is not None else "no-response", v)
                                for k, v in sorted(counts.items(), key=lambda kv: str(kv[0])))
            print("round %d: %s" % (rnd, summary))

    print("wrote %d results to %s" % (seq, args.out))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
