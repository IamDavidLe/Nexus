# Task: Stockroom — a stock reservation service (dry run, single stage)

@Planner this is the complete task. Plan it, run it, and have the Integrator declare the outcome.
No clarification is available: make assumptions, record each in `dryruns/decoy-1/build/ASSUMPTIONS.md`,
and proceed.

## Goal

Build a small web service and interface for a stockroom. Staff see every item's quantity on hand and
reserve units for orders. Reserving is concurrent: many staff pick the same popular item at the same
moment, and flaky scanners resend requests. The stockroom must never promise units it doesn't have.

## Output

Everything goes in `dryruns/decoy-1/build/`. It must build and run from that folder alone:
`docker build -t stockroom dryruns/decoy-1/build && docker run --network none -p 8080:8080 stockroom`.

## Stack (fixed)

- Python 3.12 standard library only, including `sqlite3` for storage. No third-party packages, so the
  build needs no network. Base image: `python:3.12-alpine`.
- Storage is a SQLite database file inside the container. Correctness rules below must be enforced by
  the database (constraints and atomic statements inside database transactions), not only in Python.
- The interface is plain HTML, CSS and JavaScript served by the same process. No external fonts,
  scripts or styles.

## Runtime limits

- Listens on port 8080 inside the container.
- 1 CPU, 512 MB memory.
- No network at build time or at run time.
- Health check: `GET /health` returns status 200 with body `ok` once the service can serve requests.
- Must handle at least 50 concurrent requests.

## Interface contract

All bodies are JSON. Quantities are integers. Unknown item: 404. Invalid input: 400 with
`{"error": "<reason>"}`.

| Method | Path | Body | Success |
|--------|------|------|---------|
| GET | `/health` | | 200, body `ok` (plain text) |
| GET | `/items` | | 200, `[{"sku": "A1", "name": "Widget", "on_hand": 10, "reserved": 3}]` sorted by sku |
| POST | `/items` | `{"sku": "A1", "name": "Widget", "on_hand": 10}` | 201, the item. 409 if the sku exists |
| POST | `/items/{sku}/restock` | `{"quantity": 5}` | 200, the item |
| POST | `/items/{sku}/reservations` | `{"quantity": 2}` | 201, `{"id": "<id>", "sku": "A1", "quantity": 2, "status": "active"}`. 409 `{"error": "insufficient stock"}` if fewer than `quantity` units are available |
| DELETE | `/reservations/{id}` | | 200, the reservation with `"status": "released"`; units return to available. Releasing twice is a no-op returning the same body |

Definitions: `available = on_hand - reserved`. `reserved` is the sum of active reservations for the item.
`quantity` in every request must be an integer from 1 to 1000 inclusive; anything else is 400.

### Retry safety

`POST /items/{sku}/reservations` and `POST /items/{sku}/restock` accept an optional `Request-Key` header.
A request repeated with the same key returns the original response (same status and body) and applies
its effect only once, even when the repeats arrive at the same time.

## Invariants (the Breaker attacks these)

1. **Never oversold.** For every item, at all times: `0 <= reserved <= on_hand`.
2. **Concurrency.** 50 simultaneous reservations for the same item, each for 1 unit, against 10 available,
   produce exactly 10 successes and 40 `insufficient stock` responses, and `reserved` rises by exactly 10.
3. **Retry safety.** A reservation sent 20 times with the same `Request-Key`, in sequence or all at once,
   creates exactly one reservation.
4. **Conservation.** Across any sequence of reservations and releases (no restocks), each item's `on_hand`
   is unchanged, and `reserved` equals the sum of its active reservations.

## Interface requirements

- One page at `/` listing items with on hand, reserved and available; a form to add an item; per item,
  a way to reserve a quantity and to restock; a list of active reservations with a release button.
- Clear loading, empty ("No items yet") and error states. Errors from the service are shown in words.
- Works by keyboard alone. No console errors.
- Usable at phone width and desktop width, with no horizontal scrolling on a phone.

## Done means

Everything in `factory/protocols/definition-of-done.md`, applied to `dryruns/decoy-1/build/`, including a
passing clean offline container check with health path `/health` and port 8080, and viewport screenshots.
