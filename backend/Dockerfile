# Use Python 3.10 slim
FROM python:3.10-slim

# Set environment variables at build time
ARG USDA_API_KEY
ARG INSTACART_API_KEY
ARG GOOGLE_APPLICATION_CREDENTIALS
ARG GCS_BUCKET_NAME
ARG GEMINI_API_KEY
ARG CELERY_BROKER_URL
ARG CELERY_RESULT_BACKEND
ARG REDIS_PASSWORD
ARG FRONTEND_WEBHOOK_URL

ENV USDA_API_KEY=${USDA_API_KEY}
ENV INSTACART_API_KEY=${INSTACART_API_KEY}
ENV GOOGLE_APPLICATION_CREDENTIALS=${GOOGLE_APPLICATION_CREDENTIALS}
ENV GCS_BUCKET_NAME=${GCS_BUCKET_NAME}
ENV GEMINI_API_KEY=${GEMINI_API_KEY}
ENV CELERY_BROKER_URL=${CELERY_BROKER_URL}
ENV CELERY_RESULT_BACKEND=${CELERY_RESULT_BACKEND}
ENV REDIS_PASSWORD=${REDIS_PASSWORD}
ENV FRONTEND_WEBHOOK_URL=${FRONTEND_WEBHOOK_URL}

# Set the working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . /app

# Expose the FastAPI port
EXPOSE 8000

# Start the FastAPI application and Celery
CMD ["sh", "-c", "uvicorn app.main:app --host :: --port 8000 --workers 4 & celery -A app.utils.celery_config worker --loglevel=info"]