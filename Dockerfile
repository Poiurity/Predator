# Build stage — install deps and bundle the Vite app
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage — ship only what the server needs
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./
COPY --from=build /app/package.json ./
EXPOSE 8080
CMD ["node", "server.js"]
