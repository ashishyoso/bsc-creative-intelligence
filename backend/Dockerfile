# Backend image for YOSO-BSC Creative Intelligence on Railway.
# Includes ffmpeg/ffprobe for frame extraction + audio probing.
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

# ffmpeg only — ca-certificates ships with python:3.12-slim already; httpx
# covers our HTTP needs so we drop curl. Single layer, cleaned in-place.
RUN apt-get update -o Acquire::Retries=3 && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY app ./app
COPY scripts ./scripts

# Railway mounts the persistent volume here; mkdir is a fallback for first boot
RUN mkdir -p /app/vault/videos /app/vault/frames /app/vault/db

ENV VAULT_ROOT=/app/vault \
    PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2"]
