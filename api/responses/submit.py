"""POST /api/responses/submit - Submit or update a response."""
import json
from http import HTTPStatus

from ..utils.db import get_supabase_client
from ..utils.validation import validate_response_data
from ..utils.responses import json_response, error_response, options_response


def handler(request):
    """Submit or update a response."""
    if request.method == "OPTIONS":
        return options_response()

    if request.method != "POST":
        return error_response(HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed")

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, TypeError):
        return error_response(HTTPStatus.BAD_REQUEST, "Invalid JSON")

    # Validate input
    validation = validate_response_data(body)
    if not validation.valid:
        return error_response(HTTPStatus.BAD_REQUEST, ", ".join(validation.errors or []))

    session_token = body["session_token"]
    question_id = body["question_id"]
    answer_option_id = body.get("answer_option_id")
    answer_option_ids = body.get("answer_option_ids")

    supabase = get_supabase_client()

    # Verify session exists
    session = supabase.table("sessions").select("id, poll_id").eq("session_token", session_token).single().execute()
    if not session.data:
        return error_response(HTTPStatus.NOT_FOUND, "Session not found")

    session_id = session.data["id"]
    poll_id = session.data["poll_id"]

    # Verify poll is open
    poll = supabase.table("polls").select("state").eq("id", poll_id).single().execute()
    if not poll.data or poll.data["state"] != "open":
        return error_response(HTTPStatus.FORBIDDEN, "Poll is not accepting responses")

    # Verify question belongs to poll
    question = supabase.table("questions").select("id, allow_multiple").eq("id", question_id).eq("poll_id", poll_id).single().execute()
    if not question.data:
        return error_response(HTTPStatus.NOT_FOUND, "Question not found")

    # Multi-select path
    if answer_option_ids is not None:
        if not question.data.get("allow_multiple"):
            return error_response(HTTPStatus.BAD_REQUEST, "Question does not allow multiple selections")

        # Verify all answer options belong to question
        for opt_id in answer_option_ids:
            option = supabase.table("answer_options").select("id").eq("id", opt_id).eq("question_id", question_id).single().execute()
            if not option.data:
                return error_response(HTTPStatus.NOT_FOUND, f"Answer option {opt_id} not found")

        # Delete existing responses for this session+question
        supabase.table("responses").delete().eq("session_id", session_id).eq("question_id", question_id).execute()

        # Insert new rows for each selected option
        if answer_option_ids:
            rows = [
                {"session_id": session_id, "question_id": question_id, "answer_option_id": opt_id}
                for opt_id in answer_option_ids
            ]
            result = supabase.table("responses").insert(rows).execute()
            if not result.data:
                return error_response(HTTPStatus.INTERNAL_SERVER_ERROR, "Failed to save responses")

        return json_response(HTTPStatus.OK, {"success": True})

    # Single-select path
    # Verify answer option belongs to question
    option = supabase.table("answer_options").select("id").eq("id", answer_option_id).eq("question_id", question_id).single().execute()
    if not option.data:
        return error_response(HTTPStatus.NOT_FOUND, "Answer option not found")

    # Check for existing response
    existing = supabase.table("responses").select("id").eq("session_id", session_id).eq("question_id", question_id).execute()

    if existing.data:
        # Update existing response
        result = supabase.table("responses").update({
            "answer_option_id": answer_option_id
        }).eq("id", existing.data[0]["id"]).execute()
    else:
        # Insert new response
        result = supabase.table("responses").insert({
            "session_id": session_id,
            "question_id": question_id,
            "answer_option_id": answer_option_id
        }).execute()

    if result.data:
        return json_response(HTTPStatus.OK, {"success": True})

    return error_response(HTTPStatus.INTERNAL_SERVER_ERROR, "Failed to save response")
