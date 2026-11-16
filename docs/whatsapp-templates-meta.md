# Modelos de mensagem para a API oficial do WhatsApp (Meta)

Só é necessário se `WHATSAPP_PROVEDOR=meta`. A Meta exige que mensagens iniciadas pela empresa usem
modelos aprovados. Cadastre os dois abaixo em **WhatsApp Manager → Modelos de mensagem**, categoria
**Utilidade**, idioma **Português (BR)**. A ordem das variáveis precisa ser exatamente esta.

## 1. `confirmacao_demanda`

```
Olá, {{1}}! Aqui é do gabinete do Vereador Lucas Leoncine.

Recebemos sua demanda de {{2}} no bairro {{3}}.

Protocolo: {{4}}

Nossa equipe vai analisar e encaminhar seu pedido como Indicação oficial na Câmara. Você receberá as atualizações por aqui.
```
Exemplo para aprovação: `Maria` · `Iluminação` · `Praia Azul` · `LL-2026-000123`

Botão opcional (URL dinâmica): **Acompanhar** → `https://SEU-DOMINIO/acompanhar.html?p={{1}}` com exemplo `LL-2026-000123`.
Se adicionar o botão, avise o desenvolvedor para incluir o componente `button` no envio (`src/notificacoes/whatsapp.js`).

## 2. `atualizacao_demanda`

```
Olá, {{1}}! Há uma atualização na sua demanda {{2}}.

Situação: {{3}}
{{4}}

Gabinete do Vereador Lucas Leoncine
```
Exemplo: `Maria` · `LL-2026-000123` · `Indicação protocolada` · `Sua demanda virou uma Indicação oficial na Câmara e foi encaminhada à Prefeitura.`

## Provedores alternativos (sem aprovação de modelo)

- **Z-API** e **Evolution API** conectam um número de WhatsApp comum via QR Code e enviam o texto livre
  definido em `src/notificacoes/mensagens.js`. São mais simples de começar, mas não são a API oficial:
  use um número exclusivo do gabinete e evite volumes altos para não ter o número bloqueado.
