FROM oven/bun:1.3.14 AS dependencies

WORKDIR /workspace
COPY . .
RUN bun install --frozen-lockfile

FROM dependencies AS development

WORKDIR /workspace/services/auth
CMD ["bun", "--watch", "src/index.ts"]

FROM dependencies AS build

WORKDIR /workspace/services/auth
RUN bun run build

FROM oven/bun:1.3.14 AS production

WORKDIR /app
COPY --from=build /workspace/services/auth/dist ./dist
EXPOSE 3000
CMD ["bun", "dist/index.js"]
