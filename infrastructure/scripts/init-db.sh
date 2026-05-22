#!/bin/bash
# Creates the n8n database alongside the main jarvis database on first startup.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE n8n;
    GRANT ALL PRIVILEGES ON DATABASE n8n TO "$POSTGRES_USER";
EOSQL
