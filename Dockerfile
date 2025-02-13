FROM node:22 AS builder

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/patches/ .yarn/patches/
COPY .yarn/releases/ .yarn/releases/

RUN yarn --immutable

COPY . .

RUN yarn build

FROM node:22 AS production

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json /app/yarn.lock /app/.yarnrc.yml /app/.yarn ./
COPY --from=builder /app/.yarn/patches/ .yarn/patches/
COPY --from=builder /app/.yarn/releases/ .yarn/releases/

RUN yarn workspaces focus --production

FROM gcr.io/distroless/nodejs22-debian12

WORKDIR /app

COPY --from=production /app .

# Distroless is as the name implies, distroless. The entrypoint is `node`, and
# there is no shell. Therefore, the following command will not work:
#
#   CMD ["yarn", "start:prod"]
#
# Instead, we need to pass node the flags it needs to use PnP directly, as well
# as the script we want to run:

CMD ["--require", "./.pnp.cjs", "--experimental-loader", "./.pnp.loader.mjs", "dist/main.js"]
