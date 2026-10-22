import hmac
from typing import Generator, Optional, List
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import jwt

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.models import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)

def get_current_user(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme)
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = int(payload.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Authenticated user account not found",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Contact the administrator.",
        )
    return user

def require_role(allowed_roles: List[UserRole]):
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Requires role {[r.value for r in allowed_roles]}, but user has role {current_user.role.value}"
            )
        return current_user
    return role_checker

require_admin = require_role([UserRole.ADMIN])
require_lecturer_or_admin = require_role([UserRole.ADMIN, UserRole.LECTURER])
require_placement_staff = require_role([UserRole.ADMIN, UserRole.PLACEMENT_OFFICER])
require_student = require_role([UserRole.STUDENT])
require_authenticated = get_current_user

def verify_integration_secret(
    x_integration_secret: Optional[str] = Header(None, alias="X-Integration-Secret"),
    authorization: Optional[str] = Header(None)
) -> bool:
    """Verifies that incoming Google Sheets / RFID webhook has the shared secret."""
    expected = settings.INTEGRATION_WEBHOOK_SECRET
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integration webhook is disabled: INTEGRATION_WEBHOOK_SECRET is not configured on the server."
        )

    if x_integration_secret and hmac.compare_digest(x_integration_secret, expected):
        return True
    
    # Also support "Bearer <secret>" in Authorization header
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        if hmac.compare_digest(token, expected):
            return True
            
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized integration request: Invalid or missing X-Integration-Secret header."
    )
