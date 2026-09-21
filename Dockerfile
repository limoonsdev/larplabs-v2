# LarpLabs V2 — Web (TanStack Start, build + preview)
FROM node:20-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# URL du backend vue par le NAVIGATEUR (build-time, surchargeable via --build-arg)
ARG VITE_BACKEND_URL=http://localhost:8000
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

RUN npm run build

EXPOSE 3000
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]
