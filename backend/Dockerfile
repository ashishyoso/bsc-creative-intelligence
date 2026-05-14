# Backend image for YOSO-BSC Creative Intelligence on Railway.
# Includes ffmpeg/ffprobe for frame extraction + audio probing.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# System deps: ffmpeg (frames + probes), git (some Python wheels need it)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY app ./app
COPY scripts ./scripts

# Railway mounts the persistent volume at this path; we mkdir as fallback
RUN mkdir -p /app/vault/videos /app/vault/frames /app/vault/db

ENV VAULT_ROOT=/app/vault \
    PORT=8000

EXPOSE 8000

# Railway sets $PORT — fall back to 8000 locally
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2"]
