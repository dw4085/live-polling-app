"""POST /api/sessions/create - Create a participant session."""
import json
from http import HTTPStatus

from ..utils.db import get_supabase_client
from ..utils.responses import json_response, error_response, options_response


def handler(request):
    """Create a new participant session."""
    if request.method == "OPTIONS":
        return options_response()

    if request.method != "POST":
        return error_response(HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed")

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, TypeError):
        return error_response(HTTPStatus.BAD_REQUEST, "Invalid JSON")

    poll_id = body.get("poll_id")
    session_token = body.get("session_token")

    if not poll_id or not session_token:
        return error_response(HTTPStatus.BAD_REQUEST, "poll_id and session_token are required")

    supabase = get_supabase_client()

    # Verify poll exists and is open
    poll = supabase.table("polls").select("state").eq("id", poll_id).single().execute()
    if not poll.data:
        return error_response(HTTPStatus.NOT_FOUND, "Poll not found")

    if poll.data["state"] != "open":
        return error_response(HTTPStatus.FORBIDDEN, "Poll is not accepting responses")

    # Check for existing session
    existing = supabase.table("sessions").select("id").eq("session_token", session_token).execute()
    if existing.data:
        return json_response(HTTPStatus.OK, {"session_id": existing.data[0]["id"]})

    # Create new session
    result = supabase.table("sessions").insert({
        "poll_id": poll_id,
        "session_token": session_token
    }).execute()

    if result.data:
        return json_response(HTTPStatus.CREATED, {"session_id": result.data[0]["id"]})

    return error_response(HTTPStatus.INTERNAL_SERVER_ERROR, "Failed to create session")
