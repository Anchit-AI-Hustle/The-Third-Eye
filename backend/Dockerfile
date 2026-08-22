FROM python:3.12-slim

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -e ".[dev]"

# Copy application code
COPY . .

# Ensure the dedicated schema exists (no-op when DB_SCHEMA=public), run
# migrations, then start the server. Cloud Run sets $PORT; default to 8000
# for local/docker-compose use where it's unset.
CMD ["sh", "-c", "python -m app.bootstrap_schema && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
