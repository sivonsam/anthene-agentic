"""FastAPI dependencies for authentication."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from auth.b2c import validate_token

bearer_scheme = HTTPBearer(auto_error=False)


class CurrentUser:
    def __init__(self, claims: dict):
        self.id: str = claims.get("oid") or claims.get("sub", "anonymous")
        self.email: str = claims.get("emails", [None])[0] if isinstance(claims.get("emails"), list) else claims.get("email", "")
        self.display_name: str = claims.get("name", claims.get("given_name", "User"))
        self.role: str = claims.get("extension_Role") or claims.get("role", "user")
        self.claims: dict = claims

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        claims = validate_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        )
    return CurrentUser(claims)


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user
