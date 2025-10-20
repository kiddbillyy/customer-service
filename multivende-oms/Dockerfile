# Dockerfile
FROM node:18-alpine
WORKDIR /app

# Copia package.json y lock si existe
COPY package*.json ./

# Si hay lockfile, usa npm ci; si no, npm install
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

# Copia el código
COPY src ./src
COPY README.md ./

EXPOSE 5016
CMD ["node", "src/server.js"]
