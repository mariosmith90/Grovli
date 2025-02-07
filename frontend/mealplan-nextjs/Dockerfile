# Frontend Dockerfile
FROM node:18-alpine

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
