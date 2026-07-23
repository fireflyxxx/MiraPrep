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
    assert response.json() == {"status": "UP", "model": "claude-sonnet-5"}


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
