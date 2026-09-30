"""The single chokepoint every amount crosses (I5).

No float is ever constructed from a request body: ``json.loads`` is called with
hooks that raise instead of building one, so ``1.5``, ``1e2``, ``1e400``,
``NaN`` and ``Infinity`` all fail during parsing rather than reaching a handler.
Amounts are plain Python integers in minor units from here to storage.
"""

import json

from .errors import InvalidRequest

#: SQLite stores 64-bit signed integers. An amount at or past this magnitude
#: cannot be held exactly, and an inexact cent is what I1 forbids (A11).
INT64_LIMIT = 2 ** 63


def _reject_float(literal):
    raise InvalidRequest(
        "numbers in a request body must be JSON integers, got %r" % (literal,)
    )


def _reject_constant(name):
    raise InvalidRequest("%s is not a valid JSON value here" % (name,))


def parse_json_object(raw):
    """Decode a request body into a ``dict``, or raise :class:`InvalidRequest`."""
    if not raw:
        raise InvalidRequest("request body is empty")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise InvalidRequest("request body is not valid UTF-8") from None
    try:
        value = json.loads(
            text, parse_float=_reject_float, parse_constant=_reject_constant
        )
    except InvalidRequest:
        raise
    except (ValueError, RecursionError):
        raise InvalidRequest("request body is not valid JSON") from None
    if not isinstance(value, dict):
        raise InvalidRequest("request body must be a JSON object")
    return value


def coerce_integer(value, field):
    """Return ``value`` when it is a JSON integer in range, else raise."""
    if value is True or value is False:
        raise InvalidRequest("'%s' must be a JSON integer, not a boolean" % (field,))
    if not isinstance(value, int):
        raise InvalidRequest("'%s' must be a JSON integer" % (field,))
    if value >= INT64_LIMIT or value <= -INT64_LIMIT:
        raise InvalidRequest("'%s' is out of range for a 64-bit integer" % (field,))
    return value


def require_integer(body, field):
    """Read a required JSON integer field out of an already-decoded body."""
    if field not in body:
        raise InvalidRequest("'%s' is required" % (field,))
    return coerce_integer(body[field], field)
