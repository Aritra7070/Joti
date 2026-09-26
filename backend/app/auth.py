"""Minimal multi-tenant auth: username + password, HS256 JWTs, 7-day expiry.
Users are rows in public.users (see store.get_user / store.create_user)."""
import hashlib
import hmac
import re
import secrets
import time

import jwt
from fastapi import Depends, HTTPException, Request

from . import config, store

TOKEN_TTL = 7 * 24 * 3600
USERNAME_RE = re.compile(r"^[a-z0-9_.-]{3,32}$")


def _hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return salt.hex() + ":" + digest.hex()


def _verify(password: str, stored: str) -> bool:
    salt_hex, digest_hex = stored.split(":")
    candidate = _hash(password, bytes.fromhex(salt_hex)).split(":")[1]
    return hmac.compare_digest(candidate, digest_hex)


def signup(username: str, password: str) -> str:
    username = username.strip().lower()
    if not USERNAME_RE.match(username):
        raise HTTPException(400, "Username must be 3–32 characters: letters, numbers, dots, dashes or underscores.")
    if len(password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    if store.get_user(username):
        raise HTTPException(409, "That username is taken.")
    uid = store.create_user(username, _hash(password))
    return issue(username, uid)


def login(username: str, password: str) -> str:
    username = username.strip().lower()
    user = store.get_user(username)
    if not user or not _verify(password, user["password_hash"]):
        raise HTTPException(401, "Wrong username or password.")
    return issue(username, user["id"])


def issue(username: str, uid: int) -> str:
    now = int(time.time())
    return jwt.encode({"sub": username, "uid": uid, "iat": now, "exp": now + TOKEN_TTL}, config.JWT_SECRET, algorithm="HS256")


def decode(token: str) -> dict:
    try:
        return jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "expired")
    except jwt.PyJWTError:
        raise HTTPException(401, "invalid token")


def _token_from(request: Request) -> str | None:
    h = request.headers.get("authorization", "")
    if h.lower().startswith("bearer "):
        return h[7:].strip()
    return request.query_params.get("token")  # links opened in a new tab can't send headers


def current_user(request: Request) -> dict:
    """{"id": int, "username": str}. Re-checks the user still exists (cheap PK select)
    so a deleted user is logged out even with an unexpired token."""
    token = _token_from(request)
    if not token:
        raise HTTPException(401, "not signed in")
    payload = decode(token)
    uid = payload.get("uid")
    user = store.get_user_by_id(uid) if uid is not None else None
    if not user:
        raise HTTPException(401, "invalid token")
    return user


CurrentUser = Depends(current_user)
