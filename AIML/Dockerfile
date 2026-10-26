FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 5000 5050

# Set environment variables
ENV FLASK_APP=server.py
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1
ENV OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    DEVICE_DETECTION_IMGSZ=416 \
    ACTIVE_SCENE_EVERY_N_CYCLES=2 \
    STATIC_SCENE_EVERY_N_CYCLES=3

# Run the application
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "server:app"]
