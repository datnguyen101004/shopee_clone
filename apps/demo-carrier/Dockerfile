FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/demo-carrier/package.json apps/demo-carrier/package.json
COPY packages/config packages/config
COPY packages/contracts packages/contracts
RUN pnpm install --frozen-lockfile
COPY apps/demo-carrier apps/demo-carrier
RUN pnpm --filter @shopee-clone/contracts build && pnpm --filter @shopee-clone/demo-carrier build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/apps/demo-carrier/dist ./dist
COPY --from=build /workspace/apps/demo-carrier/package.json ./package.json
COPY --from=build /workspace/node_modules ./node_modules
# Workspace links are not usable after copying node_modules into the
# standalone runtime image. Ship the compiled contracts package at the
# normal Node resolution path instead of relying on a second workspace DB or
# checkout at runtime.
COPY --from=build /workspace/packages/contracts/dist ./node_modules/@shopee-clone/contracts/dist
COPY --from=build /workspace/packages/contracts/package.json ./node_modules/@shopee-clone/contracts/package.json
EXPOSE 3010
CMD ["node", "dist/main.js"]
