"""POST /api/questions/create - Create a new question."""
import json
from http import HTTPStatus

from ..utils.auth import verify_admin_token
from ..utils.db import get_supabase_client
from ..utils.validation import validate_question_data
from ..utils.responses import json_response, error_response, options_response


def handler(request):
    """Create a new question with answer options."""
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
    validation = validate_question_data(body)
    if not validation.valid:
        return error_response(HTTPStatus.BAD_REQUEST, ", ".join(validation.errors or []))

    supabase = get_supabase_client()

    poll_id = body["poll_id"]

    # Verify poll exists
    poll = supabase.table("polls").select("id").eq("id", poll_id).single().execute()
    if not poll.data:
        return error_response(HTTPStatus.NOT_FOUND, "Poll not found")

    # Get next question order
    existing_questions = supabase.table("questions").select("question_order").eq("poll_id", poll_id).order("question_order", desc=True).limit(1).execute()
    next_order = (existing_questions.data[0]["question_order"] + 1) if existing_questions.data else 0

    # Create question
    question_result = supabase.table("questions").insert({
        "poll_id": poll_id,
        "question_text": body["question_text"],
        "question_order": next_order,
        "chart_type": body.get("chart_type", "horizontal_bar")
    }).execute()

    if not question_result.data:
        return error_response(HTTPStatus.INTERNAL_SERVER_ERROR, "Failed to create question")

    question = question_result.data[0]

    # Create answer options
    answer_options = body.get("answer_options", [])
    if answer_options:
        options_data = [
            {
                "question_id": question["id"],
                "option_text": opt["option_text"],
                "option_order": i
            }
            for i, opt in enumerate(answer_options)
        ]
        options_result = supabase.table("answer_options").insert(options_data).execute()
        question["answer_options"] = options_result.data

    return json_response(HTTPStatus.CREATED, question)
