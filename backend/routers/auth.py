"""
Auth router — Phase 2.

POST /api/auth/register   → create account (first user gets admin)
POST /api/auth/login      → returns JWT access token
GET  /api/auth/me         → current user info
POST /api/auth/logout     → client discards token
"""
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, field_validator
from typing import Optional

from db.database import get_db
from db.models import User
from core.security import hash_password, verify_password, create_access_token, decode_token

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    username: str
    full_name: Optional[str] = ""
    password: str

    @field_validator("password")
    @classmethod
    def strong_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("username")
    @classmethod
    def valid_username(cls, v):
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        return v.lower()

    @field_validator("email")
    @classmethod
    def valid_email(cls, v):
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


# ── Dependency: get current user from JWT ─────────────────────────────────────

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or disabled")
    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return current_user


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        # Check uniqueness
        existing = await db.execute(
            select(User).where(
                (User.email == payload.email) | (User.username == payload.username)
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email or username already registered")

        # First user → admin
        count_result = await db.execute(select(func.count()).select_from(User))
        is_first = (count_result.scalar() or 0) == 0

        user = User(
            email=payload.email,
            username=payload.username,
            full_name=payload.full_name or "",
            hashed_password=hash_password(payload.password),
            role="admin" if is_first else "operator",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        token = create_access_token({"sub": str(user.id), "role": user.role})
        logger.info(f"Registered: {user.username} role={user.role}")
        return TokenResponse(access_token=token, user=user.to_dict())

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Register error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


@router.post("/login", response_model=TokenResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(User).where(
                (User.username == form.username.lower()) | (User.email == form.username.lower())
            )
        )
        user = result.scalar_one_or_none()
        if not user or not verify_password(form.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Incorrect username or password")
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account disabled")

        user.last_login = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.commit()

        token = create_access_token({"sub": str(user.id), "role": user.role})
        return TokenResponse(access_token=token, user=user.to_dict())

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return current_user.to_dict()


@router.post("/logout")
async def logout():
    return {"message": "Logged out"}
