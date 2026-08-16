# Match this tag to the Playwright package version in package.json. The image
# includes Chromium and all Linux libraries required to launch it.
FROM mcr.microsoft.com/playwright:v1.58.2-noble

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json* ./

RUN npm ci

COPY . .

RUN npm run build

RUN npm prune --omit=dev && npm cache clean --force

CMD ["npm", "run", "docker-start"]
