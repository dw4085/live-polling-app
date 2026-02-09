"""Input validation utilities."""
import re
from typing import NamedTuple, List, Optional


class ValidationResult(NamedTuple):
    valid: bool
    errors: Optional[List[str]] = None


def validate_poll_data(data: dict) -> ValidationResult:
    """Validate poll creation/update data."""
    errors = []

    title = data.get("title")
    if not title or not isinstance(title, str):
        errors.append("Title is required")
    elif len(title) > 255:
        errors.append("Title must be 255 characters or less")

    slug = data.get("slug")
    if slug:
        if not isinstance(slug, str):
            errors.append("Slug must be a string")
        elif not re.match(r"^[a-z0-9-]+$", slug):
            errors.append("Slug can only contain lowercase letters, numbers, and hyphens")
        elif len(slug) > 100:
            errors.append("Slug must be 100 characters or less")

    password = data.get("password")
    if password and len(password) < 4:
        errors.append("Password must be at least 4 characters")

    return ValidationResult(valid=len(errors) == 0, errors=errors if errors else None)


def validate_question_data(data: dict) -> ValidationResult:
    """Validate question creation/update data."""
    errors = []

    poll_id = data.get("poll_id")
    if not poll_id:
        errors.append("Poll ID is required")

    question_text = data.get("question_text")
    if not question_text or not isinstance(question_text, str):
        errors.append("Question text is required")

    chart_type = data.get("chart_type")
    if chart_type and chart_type not in ["horizontal_bar", "vertical_bar", "pie", "donut"]:
        errors.append("Invalid chart type")

    answer_options = data.get("answer_options")
    if answer_options:
        if not isinstance(answer_options, list):
            errors.append("Answer options must be a list")
        elif len(answer_options) < 2:
            errors.append("At least 2 answer options are required")
        else:
            for i, opt in enumerate(answer_options):
                if not isinstance(opt, dict) or not opt.get("option_text"):
                    errors.append(f"Answer option {i + 1} must have option_text")

    return ValidationResult(valid=len(errors) == 0, errors=errors if errors else None)


def validate_response_data(data: dict) -> ValidationResult:
    """Validate response submission data."""
    errors = []

    if not data.get("session_token"):
        errors.append("Session token is required")

    if not data.get("question_id"):
        errors.append("Question ID is required")

    if not data.get("answer_option_id"):
        errors.append("Answer option ID is required")

    return ValidationResult(valid=len(errors) == 0, errors=errors if errors else None)
