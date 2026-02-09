"""Authentication utilities."""
import os
import hashlib
from datetime import datetime, timedelta
from typing import Optional, NamedTuple

import bcrypt
from jose import jwt, JWTError


class AuthResult(NamedTuple):
    success: bool
    error: Optional[str] = None


JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24


def verify_admin_password(password: str) -> bool:
    """Verify the admin master password."""
    stored_hash = os.environ.get("ADMIN_PASSWORD_HASH")
    if not stored_hash:
        # In development, allow a default password
        return password == "admin"

    return bcrypt.checkpw(password.encode(), stored_hash.encode())


def create_admin_token() -> str:
    """Create a JWT token for admin authentication."""
    expires = datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)
    payload = {
        "sub": "admin",
        "exp": expires,
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_admin_token(request) -> AuthResult:
    """Verify the admin JWT token from request headers."""
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        return AuthResult(success=False, error="Missing or invalid Authorization header")

    token = auth_header[7:]  # Remove "Bearer " prefix

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("sub") != "admin":
            return AuthResult(success=False, error="Invalid token subject")
        return AuthResult(success=True)
    except JWTError as e:
        return AuthResult(success=False, error=f"Token verification failed: {str(e)}")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(password.encode(), password_hash.encode())
