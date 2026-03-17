FROM node:20-alpine

WORKDIR /app

COPY package.json ./

RUN npm install --omit=dev

COPY arena-seng.html ./
COPY arena-seng-app.js ./
COPY server.js ./
COPY ONLINE-SETUP.md ./
COPY LICENSE ./

RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/data

EXPOSE 3000

CMD ["npm", "start"]
