from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)


def test_health_reports_up_and_configured_model() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "UP", "model": "claude-sonnet-5"}


def test_internal_ping_rejects_missing_token() -> None:
    response = client.get("/internal/ping")

    assert response.status_code == 403
    assert response.json()["detail"] == "invalid internal token"


def test_internal_ping_accepts_matching_token() -> None:
    response = client.get("/internal/ping", headers={"X-Internal-Token": "test-internal-token"})

    assert response.status_code == 200
    assert response.json() == {"status": "UP"}


def test_openapi_docs_are_served() -> None:
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").json()["info"]["title"] == "MiraPrep AI Service"


def test_unhandled_errors_have_request_id_and_error_envelope() -> None:
    @app.get("/_test/boom")
    async def boom() -> None:
        raise RuntimeError("unexpected")

    response = client.get("/_test/boom", headers={"X-Request-ID": "request-under-test"})

    assert response.status_code == 500
    assert response.headers["X-Request-ID"] == "request-under-test"
    assert response.json() == {"type": "error", "payload": {"message": "internal server error"}}
