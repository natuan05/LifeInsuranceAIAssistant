FROM python:3.13-slim-bookworm AS base

WORKDIR /app

# Install minimal system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy build config and source to install package and dependencies
COPY apps/agent/pyproject.toml ./apps/agent/
COPY apps/agent/src ./apps/agent/src
RUN pip install --no-cache-dir "setuptools>=80" && \
    pip install --no-cache-dir -e ./apps/agent

# Copy shared contracts, data fixtures, migrations, and evaluations
COPY contracts ./contracts
COPY data ./data
COPY apps/agent ./apps/agent

WORKDIR /app/apps/agent

EXPOSE 8090

# Default command: run Starlette/Uvicorn HTTP service
CMD ["python", "-m", "life_agent.http", "serve"]
