# Frontend Dockerfile
FROM node:18-alpine

# Set environment variables at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

ARG NEXT_PUBLIC_AUTH0_DOMAIN
ENV NEXT_PUBLIC_AUTH0_DOMAIN=${NEXT_PUBLIC_AUTH0_DOMAIN}

ARG NEXT_PUBLIC_PAYMENT_API_URL
ENV NEXT_PUBLIC_PAYMENT_API_URL=${NEXT_PUBLIC_PAYMENT_API_URL}

ARG NEXT_PUBLIC_AUTH0_AUDIENCE
ENV NEXT_PUBLIC_AUTH0_AUDIENCE=${NEXT_PUBLIC_AUTH0_AUDIENCE}

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package.json /app/

# Install dependencies
RUN npm install
 
# Copy the rest of the application code
COPY . /app

# Build the application using `next build`
RUN npm run build

# Expose the port Next.js will run on
EXPOSE 3000

# Start the application in production mode
CMD ["npm", "start"]
