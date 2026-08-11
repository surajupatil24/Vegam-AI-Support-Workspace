from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import User
from app.utils.redmine_client import RedmineClient
from app.utils.auth import AuthService
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    redmine_id: Optional[int] = None

    class Config:
        orm_mode = True


def _extract_bearer_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise ValueError("Invalid auth scheme")
        return token
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header"
        ) from exc


def _resolve_user_from_token(token: str, db: Session) -> User:
    payload = AuthService.verify_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return user


async def require_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> User:
    token = _extract_bearer_token(authorization)
    return _resolve_user_from_token(token, db)


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate user with their own Redmine username and password
    """
    normalized_username = request.username.strip()
    redmine = RedmineClient(username=normalized_username, password=request.password)

    try:
        current_redmine_user = await redmine.get_current_user()

        if not current_redmine_user or not current_redmine_user.get("id"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Redmine credentials"
            )

        redmine_login = current_redmine_user.get("login") or normalized_username
        redmine_user_id = current_redmine_user.get("id")

        # Prefer Redmine identity so users don't get duplicated if the typed casing changes.
        user = db.query(User).filter(User.redmine_id == redmine_user_id).first()
        if not user:
            user = db.query(User).filter(User.username == redmine_login).first()

        if not user:
            user = User(
                username=redmine_login,
                email=current_redmine_user.get("mail", f"{redmine_login}@vegam.co"),
                full_name=current_redmine_user.get("name", redmine_login),
                redmine_id=redmine_user_id,
                is_active=True,
                role="engineer"
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            logger.info("Created new user from Redmine: %s", redmine_login)
        else:
            user.username = redmine_login
            user.email = current_redmine_user.get("mail", user.email or f"{redmine_login}@vegam.co")
            user.full_name = current_redmine_user.get("name", user.full_name or redmine_login)
            user.redmine_id = redmine_user_id
            user.is_active = True
            logger.info("Authenticated existing user: %s", redmine_login)

        db.commit()
        db.refresh(user)

        access_token = AuthService.create_access_token(
            data={"sub": str(user.id), "username": user.username, "redmine_id": user.redmine_id}
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed - invalid Redmine credentials"
        )


@router.post("/test-redmine")
async def test_redmine_connection(request: LoginRequest):
    """Test Redmine connection with provided credentials"""
    redmine = RedmineClient(username=request.username, password=request.password)

    try:
        current_user = await redmine.get_current_user()
        if current_user and current_user.get("id"):
            return {
                "success": True,
                "message": "Connected to Redmine successfully",
                "user": {
                    "id": current_user.get("id"),
                    "username": current_user.get("login"),
                    "name": current_user.get("name"),
                    "email": current_user.get("mail")
                }
            }
        else:
            return {
                "success": False,
                "message": "Invalid Redmine credentials - user not found"
            }
    except Exception as e:
        error_str = str(e)
        return {
            "success": False,
            "message": f"Failed to connect to Redmine: {error_str}",
            "details": "Check your username, password, and ensure the Redmine server is accessible"
        }


@router.post("/logout")
async def logout():
    """Logout user (client-side token removal)"""
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    current_user: User = Depends(require_current_user)
):
    """
    Get current authenticated user

    Extracts user from JWT token
    """
    return current_user


@router.post("/validate")
async def validate_token(authorization: Optional[str] = Header(None)):
    """Validate JWT token"""
    if not authorization:
        return {"valid": False}

    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            return {"valid": False}

        payload = AuthService.verify_token(token)
        return {"valid": bool(payload)}
    except Exception:
        return {"valid": False}
