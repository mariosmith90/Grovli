# Frontend Dockerfile
FROM node:18-alpine

# Auth0 environment variables
ARG AUTH0_DOMAIN
ENV AUTH0_DOMAIN=${AUTH0_DOMAIN}
ARG AUTH0_CLIENT_ID
ENV AUTH0_CLIENT_ID=${AUTH0_CLIENT_ID}
ARG AUTH0_CLIENT_SECRET
ENV AUTH0_CLIENT_SECRET=${AUTH0_CLIENT_SECRET}
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

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