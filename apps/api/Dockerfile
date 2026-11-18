FROM node:22.23.5-bookworm-slim AS build
RUN npm install --global pnpm@11.13.1
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile --filter @exam-prep/api... --filter exam-prep-marketplace
RUN pnpm build:server
RUN pnpm --filter @exam-prep/api deploy --legacy --prod --frozen-lockfile /app

FROM node:22.23.5-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app .
USER node
EXPOSE 3001 3002
CMD ["node", "dist/main.js"]
# Worker uses the same image with command: node dist/worker.js
