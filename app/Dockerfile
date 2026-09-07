# L'app servie comme un site : le natel ouvre http://IP-du-Pi:8088 et
# l'ajoute à l'écran d'accueil. Pas de Xcode, pas d'Android Studio, pas de
# réinstallation à chaque changement.
#
# L'URL et le jeton entrent AU BUILD (import.meta.env les fige) : ils
# arrivent en arguments, lus par docker compose dans app/.env.
#
#   docker compose --env-file app/.env -f docker-compose.dev.yml up --build -d app

FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_HA_URL
ARG VITE_HA_TOKEN
# Sans jeton, l'app se construirait très bien et ne se connecterait jamais.
RUN test -n "$VITE_HA_TOKEN" || { echo "VITE_HA_TOKEN manquant : lancez avec --env-file app/.env" >&2; exit 1; }
ENV VITE_HA_URL=$VITE_HA_URL VITE_HA_TOKEN=$VITE_HA_TOKEN
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
