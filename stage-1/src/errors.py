"""Errors that map straight onto the interface contract's JSON error bodies."""


class ApiError(Exception):
    """An error the service turns into a JSON body with a known status code."""

    status = 500
    error = "internal_error"

    def __init__(self, detail=None):
        super().__init__(detail or self.error)
        self.detail = detail

    def body(self):
        payload = {"error": self.error}
        if self.detail is not None:
            payload["detail"] = self.detail
        return payload


class InvalidRequest(ApiError):
    status = 422
    error = "invalid_request"


class RequestTimeout(ApiError):
    status = 408
    error = "request_timeout"


class NotFound(ApiError):
    status = 404
    error = "not_found"


class MethodNotAllowed(ApiError):
    """405 carries an ``Allow`` header listing the methods the path does serve."""

    status = 405
    error = "method_not_allowed"

    def __init__(self, allowed, detail=None):
        super().__init__(detail)
        self.allowed = tuple(allowed)
