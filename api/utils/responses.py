"""HTTP response utilities for Vercel serverless functions."""
import json
from http import HTTPStatus
from typing import Any


def json_response(status: HTTPStatus, data: Any) -> dict:
    """Create a JSON response for Vercel serverless functions."""
    return {
        "statusCode": status.value,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
        },
        "body": json.dumps(data)
    }


def error_response(status: HTTPStatus, message: str) -> dict:
    """Create an error response."""
    return json_response(status, {"error": message})


def options_response() -> dict:
    """Handle CORS preflight requests."""
    return {
        "statusCode": 204,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "86400"
        },
        "body": ""
    }
