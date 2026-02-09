"""GET /api/admin/verify - Verify admin token."""
from http import HTTPStatus

from ..utils.auth import verify_admin_token
from ..utils.responses import json_response, error_response, options_response


def handler(request):
    """Verify admin JWT token."""
    if request.method == "OPTIONS":
        return options_response()

    if request.method != "GET":
        return error_response(HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed")

    result = verify_admin_token(request)
    if result.success:
        return json_response(HTTPStatus.OK, {"valid": True})
    else:
        return json_response(HTTPStatus.OK, {"valid": False})
