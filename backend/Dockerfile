FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    libpq-dev \
    redis-server \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .
COPY tiktoken_cache ./tiktoken_cache
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

# Embedded Redis for free single-instance Cloud Run (ephemeral; swap REDIS_URL
# to Upstash when you want durable streams). Starts Redis, migrates, serves.
CMD ["sh", "-c", "redis-server --daemonize yes --bind 127.0.0.1 --save \"\" --appendonly no && python -m app.bootstrap_schema && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
