# Portal de Demandas — imagem única (Node + Python-docx + LibreOffice para PDF)
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-docx python3-pil \
      libreoffice-writer-nogui fonts-liberation fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY public ./public
COPY painel ./painel
COPY server ./server

WORKDIR /app/server
RUN [ -f templates/indicacao.docx ] || python3 scripts/gerar_modelo_indicacao.py templates/indicacao.docx

# PORTA: porta local; em serviços como o Render, a variável PORT definida por eles tem prioridade (ver config.js).
# Para guardar os dados de forma permanente, monte um volume em /dados (docker-compose.yml já faz isso).
ENV NODE_ENV=production PORTA=3000 PASTA_DADOS=/dados HOME=/tmp
RUN mkdir -p /dados && chown node:node /dados
EXPOSE 3000
USER node
HEALTHCHECK --interval=60s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||process.env.PORTA||3000)+'/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
