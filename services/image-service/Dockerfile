FROM node:18-alpine

# Install dependencies for Sharp (image processing)
RUN apk add --no-cache \
    vips-dev \
    python3 \
    make \
    g++

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY src ./src

# Build
RUN npm run build

# Expose port
EXPOSE 3003

# Start service
CMD ["npm", "start"]
