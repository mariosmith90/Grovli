# Use Python 3.10 slim
FROM python:3.10-slim

# Set environment variables at build time
# ARG OPENAI_API_KEY
# ARG USDA_API_KEY
# ARG INSTACART_API_KEY

# ENV OPENAI_API_KEY=${OPENAI_API_KEY}
# ENV USDA_API_KEY=${USDA_API_KEY}
# ENV INSTACART_API_KEY=${INSTACART_API_KEY}

# Set the working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . /app

# Expose the FastAPI port
EXPOSE 8000

# Start the FastAPI application
CMD ["uvicorn", "app.main:app", "--host", "::", "--port", "8000", "--reload"]