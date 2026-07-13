import hmac

from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings


def require_internal_token(
    x_internal_token: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    """Reject calls that do not carry the shared service-to-service token."""

    expected_token = settings.internal_token.get_secret_value()
    if not x_internal_token or not hmac.compare_digest(x_internal_token, expected_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid internal token")
