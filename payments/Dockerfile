# Use the official Python image as base
FROM python:3.10


ARG STRIPE_SECRET_KEY
ENV STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}

ARG STRIPE_ENDPOINT_SECRET
ENV STRIPE_ENDPOINT_SECRET=${STRIPE_ENDPOINT_SECRET}

ARG AUTH0_DOMAIN
ENV AUTH0_DOMAIN=${AUTH0_DOMAIN}

ARG AUTH0_AUDIENCE
ENV AUTH0_AUDIENCE=${AUTH0_AUDIENCE}

ARG AUTH0_CLIENT_ID
ENV AUTH0_CLIENT_ID=${AUTH0_CLIENT_ID}

ARG AUTH0_CLIENT_SECRET
ENV AUTH0_CLIENT_SECRET=${AUTH0_CLIENT_SECRET}

# Set the working directory inside the container
WORKDIR /app

# Copy requirements file and install dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files into the container
COPY . /app/

# Expose the port Flask will run on
EXPOSE 4242

# Define environment variables for Flask
ENV FLASK_APP=server.py
ENV FLASK_RUN_PORT=4242

# Run the Flask application
CMD ["python", "-m", "flask", "run", "--host=0.0.0.0", "--port=4242"]

