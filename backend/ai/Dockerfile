FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

ARG EMBEDDING_MODEL=BAAI/bge-small-zh-v1.5
ENV HF_HOME=/opt/huggingface
RUN uv run --with huggingface-hub python -c \
    "from huggingface_hub import snapshot_download; snapshot_download('${EMBEDDING_MODEL}')"

FROM python:3.12-slim-bookworm AS runner
ENV PATH=/opt/venv/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV HF_HOME=/opt/huggingface
ENV HF_HUB_OFFLINE=1
WORKDIR /app
RUN useradd --system --uid 1001 --create-home miraprep
COPY --from=builder --chown=miraprep:miraprep /opt/venv /opt/venv
COPY --from=builder --chown=miraprep:miraprep /opt/huggingface /opt/huggingface
COPY --chown=miraprep:miraprep app ./app
USER miraprep
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
