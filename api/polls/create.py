"""POST /api/polls/create - Create a new poll."""
import json
import secrets
import string
from http import HTTPStatus

from ..utils.auth import verify_admin_token, hash_password
from ..utils.db import get_supabase_client
from ..utils.validation import validate_poll_data
from ..utils.responses import json_response, error_response, options_response


def generate_access_code(length: int = 8) -> str:
    """Generate a random alphanumeric access code."""
    # Remove ambiguous characters
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def handler(request):
    """Create a new poll."""
    if request.method == "OPTIONS":
        return options_response()

    if request.method != "POST":
        return error_response(HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed")

    # Verify admin authentication
    auth_result = verify_admin_token(request)
    if not auth_result.success:
        return error_response(HTTPStatus.UNAUTHORIZED, auth_result.error or "Unauthorized")

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, TypeError):
        return error_response(HTTPStatus.BAD_REQUEST, "Invalid JSON")

    # Validate input
    validation = validate_poll_data(body)
    if not validation.valid:
        return error_response(HTTPStatus.BAD_REQUEST, ", ".join(validation.errors or []))

    supabase = get_supabase_client()

    # Check slug availability if provided
    slug = body.get("slug")
    if slug:
        existing = supabase.table("polls").select("id").eq("slug", slug).execute()
        if existing.data:
            return error_response(HTTPStatus.CONFLICT, "Slug already in use")

    # Generate unique access code
    access_code = generate_access_code()
    while True:
        existing = supabase.table("polls").select("id").eq("access_code", access_code).execute()
        if not existing.data:
            break
        access_code = generate_access_code()

    # Create poll data
    poll_data = {
        "title": body["title"],
        "slug": slug,
        "access_code": access_code,
        "state": "draft"
    }

    # Hash password if provided
    if body.get("password"):
        poll_data["password_hash"] = hash_password(body["password"])

    result = supabase.table("polls").insert(poll_data).execute()

    if result.data:
        poll = result.data[0]
        return json_response(HTTPStatus.CREATED, {
            "id": poll["id"],
            "title": poll["title"],
            "access_code": poll["access_code"],
            "slug": poll.get("slug"),
            "state": poll["state"],
            "results_revealed": poll.get("results_revealed", False)
        })

    return error_response(HTTPStatus.INTERNAL_SERVER_ERROR, "Failed to create poll")
