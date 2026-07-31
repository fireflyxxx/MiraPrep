import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client


async def test_health_reports_up_and_configured_model(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "UP", "model": "deepseek-v4-flash"}
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert (
        response.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    )


async def test_internal_ping_rejects_missing_token(client: AsyncClient) -> None:
    response = await client.get("/internal/ping")

    assert response.status_code == 403
    assert response.json()["detail"] == "invalid internal token"


async def test_internal_ping_accepts_matching_token(client: AsyncClient) -> None:
    response = await client.get(
        "/internal/ping", headers={"X-Internal-Token": "test-internal-token"}
    )

    assert response.status_code == 200
    assert response.json() == {"status": "UP"}


async def test_openapi_docs_are_served(client: AsyncClient) -> None:
    assert (await client.get("/docs")).status_code == 200
    assert (await client.get("/openapi.json")).json()["info"]["title"] == "MiraPrep AI Service"


async def test_cors_rejects_unneeded_methods_and_headers(client: AsyncClient) -> None:
    response = await client.options(
        "/interviews/1/answer",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "X-Evil-Header",
        },
    )

    assert response.status_code == 400
    assert "PUT" not in response.headers.get("access-control-allow-methods", "")
    assert "x-evil-header" not in response.headers.get("access-control-allow-headers", "").lower()


async def test_unhandled_errors_have_request_id_and_error_envelope(
    client: AsyncClient,
) -> None:
    @app.get("/_test/boom")
    async def boom() -> None:
        raise RuntimeError("unexpected")

    response = await client.get("/_test/boom", headers={"X-Request-ID": "request-under-test"})

    assert response.status_code == 500
    assert response.headers["X-Request-ID"] == "request-under-test"
    assert response.json() == {"type": "error", "payload": {"message": "internal server error"}}
