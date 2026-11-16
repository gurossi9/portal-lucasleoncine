# Portal de Demandas — Vereador Lucas Leoncine

O cidadão registra um problema do bairro pelo celular e recebe um protocolo no WhatsApp. O gabinete recebe a demanda no painel e no seu sistema (planilha ou outro), já com o documento oficial de **Indicação** pronto em Word e PDF. Quando o gabinete muda a situação, o cidadão é avisado automaticamente.

```
Cidadão (celular)                        Gabinete
──────────────────                       ─────────────────────────────────────────
Formulário  ──POST──►  Servidor  ──►  Banco (SQLite) + foto
                          │        ──►  Indicação .docx/.pdf (modelo da Câmara)
                          │        ──►  Sistema do gabinete (webhook assinado / Planilha Google)
◄── WhatsApp/E-mail ──────┘        ──►  Painel: gráficos por bairro, filtros, relatório CSV
Acompanhar protocolo ◄── situação ◄──  Mudança de status no painel
```

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `public/` | Site do cidadão: formulário (`index.html`), acompanhamento (`acompanhar.html`), textos e bairros (`config.js`) |
| `painel/` | Painel do gabinete (protegido por senha) |
| `server/src/` | Servidor: API, banco, fila de automações, documento, WhatsApp, e-mail, webhook |
| `server/templates/` | Modelo da Indicação (`indicacao.docx`) |
| `server/scripts/` | Gerador do documento (Python), receptor para Planilha Google, teste automático, esquema PostgreSQL |
| `docs/` | Status do projeto e modelos de mensagem do WhatsApp oficial |

## Requisitos

- **Node.js 22.5 ou superior.** Não há pacotes npm para instalar.
- **Python 3 com python-docx**: `pip install python-docx` ou `apt install python3-docx`.
- **LibreOffice**, para gerar o PDF: `apt install libreoffice-writer-nogui`. É opcional: sem ele, sai só o Word.

Para não instalar nada disso à mão, há um `Dockerfile` pronto.

## Rodar no computador (teste)

```bash
cd server
cp .env.example .env          # edite PAINEL_SENHA no mínimo
npm start
```
Endereços:
- Formulário: http://localhost:3000
- Painel: http://localhost:3000/painel (usuário `gabinete` e a senha do `.env`)

Teste automático completo (28 verificações): `npm run teste`

## Colocar no ar (servidor com Docker)

1. Aponte o domínio (ex.: `demandas.lucasleoncine.com.br`) para o servidor.
2. Ajuste `Caddyfile` e `server/.env` (`URL_PUBLICA`, senhas, provedores).
3. Rode `docker compose up -d --build`. O Caddy cria o HTTPS sozinho.
4. **Backup:** copie diariamente o volume `dados`. Ele guarda o banco, as fotos e os documentos.

## Ligar ao sistema do gabinete

**Planilha Google (mais simples):**
1. Siga as instruções no topo de `server/scripts/apps-script-gabinete.gs`.
2. Coloque a URL `/exec` em `GABINETE_WEBHOOK_URL`.

Cada demanda vira uma linha na planilha, e as mudanças de status atualizam a mesma linha.

**Outro sistema (CRM, sistema próprio):**
- O portal envia `POST` JSON com os eventos `demanda_criada` e `status_atualizado`.
- A assinatura HMAC-SHA256 vai no cabeçalho `X-Assinatura` e no parâmetro `?assinatura=`.
- Formato completo em `server/src/integracoes/gabinete.js`.
- Se o sistema estiver fora do ar, o portal tenta de novo automaticamente por até 24 h.

## WhatsApp

Defina `WHATSAPP_PROVEDOR` no `.env`:

| Provedor | Quando usar |
|---|---|
| `meta` | API oficial. Exige conta Business verificada e os 2 modelos aprovados (`docs/whatsapp-templates-meta.md`). Mais seguro contra bloqueio. |
| `zapi` | Serviço brasileiro pago, conecta um número por QR Code. Começa em minutos. |
| `evolution` | Open source e auto-hospedado, conecta por QR Code. Sem mensalidade, exige servidor próprio. |

Os textos das mensagens ficam em `server/src/notificacoes/mensagens.js`.

E-mail (opcional):
- **Brevo** ou **Resend**, por chave de API.
- **SMTP institucional**, depois de rodar `npm install nodemailer`.
- `EMAIL_COPIA_GABINETE` envia ao gabinete cada nova demanda com a Indicação anexada.

## Trocar pelo modelo oficial de Indicação da Câmara

1. Abra o `.docx` oficial no Word.
2. Escreva os marcadores (com chaves) onde cada dado deve entrar:
   `{numero}` `{ano}` `{ementa}` `{pedido}` `{local}` `{justificativa}` `{data_extenso}` `{vereador_maiusculo}` `{cargo}` `{bairro}` `{logradouro}` `{categoria}` `{protocolo}` `{camara}`
3. Salve como `server/templates/indicacao.docx`, substituindo o provisório.

O brasão e o cabeçalho do modelo oficial são mantidos como estão. Não é preciso mexer no código.

O texto jurídico de cada categoria fica em `server/src/catalogo.js`. Pelo painel, o gabinete ajusta o texto de uma demanda específica e gera o documento de novo.

## LGPD

- Consentimento explícito, com data registrada.
- O IP é guardado só como código irreversível (hash).
- Fotos e dados pessoais ficam só no painel, que exige senha.
- O nome do munícipe **não** aparece na Indicação: `INDICACAO_INCLUIR_NOME_MUNICIPE=0`.
- A consulta pública exige os 4 últimos dígitos do WhatsApp e não mostra dados pessoais.

## Personalizar

- **Cores:** tokens no topo de `public/styles.css`.
- **Bairros e categorias:** `public/config.js`.
- **Foto do vereador:** `public/assets/vereador.jpg`.
