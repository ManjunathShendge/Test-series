FROM node:22.23.5-bookworm-slim AS build
RUN npm install --global pnpm@11.13.1
WORKDIR /workspace
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV STANDALONE_BUILD=true
RUN pnpm install --frozen-lockfile --filter @exam-prep/web... --filter exam-prep-marketplace
RUN pnpm exec turbo run build --filter=@exam-prep/web...

FROM node:22.23.5-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
