"""POST /api/admin/login - Admin authentication endpoint."""
import json
from http import HTTPStatus

from ..utils.auth import verify_admin_password, create_admin_token
from ..utils.responses import json_response, error_response, options_response


def handler(request):
    """Handle admin login requests."""
    if request.method == "OPTIONS":
        return options_response()

    if request.method != "POST":
        return error_response(HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed")

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, TypeError):
        return error_response(HTTPStatus.BAD_REQUEST, "Invalid JSON")

    password = body.get("password")
    if not password:
        return error_response(HTTPStatus.BAD_REQUEST, "Password is required")

    if not verify_admin_password(password):
        return error_response(HTTPStatus.UNAUTHORIZED, "Invalid password")

    token = create_admin_token()
    return json_response(HTTPStatus.OK, {"token": token})
