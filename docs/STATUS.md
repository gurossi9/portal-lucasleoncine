# Portal de Demandas — Status do projeto

Gabinete do Vereador **Lucas Leoncine** — Câmara Municipal de Americana/SP
Última atualização: 16/11/2026

## Andamento

| Etapa | Situação |
|---|---|
| 1. Identidade visual + formulário mobile-first | ✅ Concluída |
| 2. API + banco + webhook do gabinete + painel por bairro | ✅ Concluída |
| 3. Gerador do documento de Indicação (DOCX/PDF) | ✅ Concluída — **padrão oficial do gabinete** desde 15/11/2026 (ver abaixo) |
| 4. Protocolo + retorno WhatsApp/E-mail + acompanhamento | ✅ Concluída |
| 5. Lista de 219 bairros | ✅ Concluída (05/11/2026) — `public/config.js` |
| 6. Busca de bairro por texto **acima da lista** | ✅ Concluída (09/11/2026) — `public/bairro-busca.js` |
| 7. Demonstração interativa com a mesma busca | ✅ Atualizada (16/11/2026) — `demo-interativa.html` agora igual à versão publicada |
| 8. Ajustes para celular e tablet (320, 375, 425 e 768 px) | ✅ Concluída (09/11/2026) — `public/styles.css`, `painel/painel.css`, `painel/painel.js`, demonstração |
| 9. Busca por CEP no campo de bairro (ViaCEP) | ✅ Concluída (09/11/2026) — `public/bairro-busca.js`, CSP em `server/src/http.js` |
| 10. Paleta oficial do Instagram | ✅ Concluída (13/11/2026) — `public/styles.css`, `painel/painel.css`, demonstração publicada |
| 11. Indicação no padrão oficial + redação por IA (prompt do gabinete) + mapa e foto | ✅ Concluída (15/11/2026) |
| 12. Limão mais escuro + fundos com textura | ✅ Concluída (16/11/2026) — `public/styles.css`, `painel/painel.css`, demonstração publicada |
| Testes automáticos | ✅ `npm run teste` 31/31 · `npm run teste:ia` 7/7 |

## Limão mais escuro e fundos novos (16/11/2026)
- Pedido do usuário: "escureça mais um pouco esse verde limão e dá uma repaginada no fundo da página, pois estão muito simples".
- **Limão:** `#C0F809` → `#A2CF0A` (um tom mais fechado). Vale para o destaque "Conte pra gente.", os números dos passos, o protocolo e o degradê do anel da foto/selo. Continua só sobre fundo azul-marinho (contraste alto).
- **Fundo da página** (antes um cinza-azulado liso `#F3F6FB`): agora `#EDF2F9` com três brilhos suaves nas cores da marca (ciano à esquerda, azul à direita, limão embaixo) e uma malha de pontos fina, fixa ao rolar. No modo escuro da demonstração os brilhos ficam mais discretos.
- **Topo (hero):** além do degradê azul, ganhou brilho limão no canto inferior, uma faixa diagonal de luz e uma **silhueta de cidade** no pé (desenho próprio, genérico, em SVG embutido).
- **Cartões:** borda de 1 px quase invisível para destacar do novo fundo.
- **Painel:** mesmo fundo; barra do topo com degradê e um filete limão embaixo.
- Conferido em 320, 390 e 1280 px (claro e escuro): sem rolagem lateral.
- Para voltar ao fundo liso, basta trocar o `background-image` do `body` (ou zerar as variáveis `--brilho-*` e `--pontos`).

## Indicação no padrão oficial (15/11/2026)
- Base: 6 Indicações protocoladas pelo gabinete em 2026 (.doc) e o prompt de redação enviado pelo usuário (`server/templates/prompt-indicacao.md`).
- **Layout** igual ao oficial: A4, Times New Roman 12, margens 5 cm em cima e 2,5 cm nos lados; cabeçalho com brasão e "Câmara Municipal de Americana / Estado de São Paulo"; brasão grande em marca-d'água; rodapé com endereço e site da Câmara. Brasão e marca-d'água foram extraídos dos próprios .doc oficiais (`server/templates/*.png`).
- **Texto**: "Autor: LUCAS LEONCINE" e a ementa "Indica …" recuados; "Senhor Presidente, / Senhores Vereadores,"; "Moradores entraram em contato com este gabinete para relatar sobre a necessidade de … Indicam-se, portanto, providências: seja a execução do serviço, notificação ou outra medida cabível."; mapa + foto lado a lado; fecho padrão "Assim, sendo procedente o pedido… É a Indicação."; "Plenário Dr. Antônio A. Lobo, em DD de mês de AAAA."; "VEREADOR / Lucas Leoncine" com espaço para assinatura à mão.
- **Nome do arquivo** igual ao do gabinete: `AAMMDD_Indica_<serviço>_<local>_no_bairro_<bairro>.docx`. Cada demanda fica em `dados/documentos/<ano>/<protocolo>/` (corrigido em 15/11: duas demandas no mesmo local e dia se sobrescreviam).
- **De onde vem o texto**: ajuste no painel > IA > texto automático.
  - Texto automático: serviço pela categoria + palavras do relato (`catalogo.js`; ex.: "vazamento" → DAE, "sarjetão", "boca de lobo"), local "na Rua X, próximo ao número N", "em cruzamento da…", "entre a… e a…". Conferido contra as 6 Indicações oficiais.
  - IA (opcional, `IA_PROVEDOR=anthropic` + `ANTHROPIC_API_KEY`): manda o prompt do gabinete + a foto; aproveita a ementa e o parágrafo do BLOCO 2 e, do BLOCO 1, setor competente e leitura da foto (mostrados no painel). Nome/WhatsApp/e-mail do munícipe não são enviados. Resposta fora do padrão ou que cite o munícipe é descartada. Falha da API não trava nada.
  - Sem número da casa: **[COMPLETAR LOCALIZAÇÃO EXATA]** grifado em amarelo no Word e aviso no painel.
- **Mapa**: OpenStreetMap com marcador (GPS do celular ou endereço via Nominatim). Sem internet, sai só a foto. Não foi possível testar com tiles reais neste ambiente (sem internet): testar quando o portal estiver no ar.
- **Painel**: bloco "Indicação — triagem" (assunto, nome do arquivo, setor sugerido, leitura da foto, origem do texto), edição de ementa + texto, botão "Redigir de novo com IA".
- **Arquivos binários** (`indicacao.docx`, `brasao-camara.png`, `marca-dagua-camara.png`) não ficam no Projeto: foram entregues no zip `templates-indicacao.zip` (pasta `server/templates/`).
- Pendências desta parte: a chave da API (se o gabinete quiser a IA); decidir se usa a assinatura digitalizada (`--assinatura`, só com autorização do vereador); conferir a lista de secretarias sugeridas em `catalogo.js`.

**Todas as etapas de desenvolvimento estão concluídas.** O que resta depende de informações ou decisões do gabinete (lista abaixo).

## Paleta oficial (13/11/2026, limão ajustado em 16/11/2026)
- Cores medidas nos posts do Instagram @lucasleoncine (artes "Descarte Irregular", "Emancipação de Americana", "Dom Carlos José") e no logo "Vereador Lucas Leoncine":
  - azul-marinho profundo `#012355` (fundo do topo) e azul institucional `#023475`;
  - azul de ação `#0F5398` (botões, links, foco);
  - ciano do logo `#23B7F2`;
  - verde-limão de realce `#A2CF0A` (era `#C0F809` até 16/11) — destaque do título, números dos passos, protocolo.
- O âmbar `#F5B700` saiu; a variável `--ambar` continua existindo e aponta para o limão, para não quebrar nada.
- O anel da foto e o selo do painel usam o degradê limão → ciano, igual à seta do logo.
- O limão só aparece sobre fundo azul-marinho (contraste alto). Sobre fundo branco os textos continuam em azul, para manter a leitura.
- Pequeno ajuste pendente: trocar `<meta name="theme-color" content="#0B1F3A">` por `#012355` em `public/index.html`, `public/acompanhar.html` e `painel/index.html` (cor da barra do navegador no celular).

## Busca de bairro (09/11/2026 — substitui a versão de 05/11)
- Pedido do usuário: **manter a lista "Selecione o bairro" como está** e ter também a opção de buscar digitando.
- O campo "Buscar bairro..." (lupa + botão de limpar) fica **acima** da lista; a lista continua visível e funcionando sozinha.
- Ao digitar (sem diferenciar maiúscula nem acento):
  - aparecem os resultados logo abaixo do campo, com o trecho destacado; toque, clique ou Enter escolhe;
  - a lista de baixo também passa a mostrar só os encontrados ("Selecione (4 encontrados)"), agrupados pela letra inicial; as letras sem resultado somem;
  - sem resultado: "Nenhum bairro encontrado para o termo pesquisado." e a opção "Usar 'texto' como outro bairro".
- Ao escolher ou limpar a busca, a lista volta completa. O bairro já escolhido nunca some da lista.
- O `<select id="bairro">` continua sendo o valor enviado: validação, envio e painel não mudaram. Se o script falhar, a lista normal continua funcionando.
- A lista agora vem agrupada por letra (A, B, C…) também sem busca.
- O pedido original falava em "acordeão": o portal não tem acordeão; o equivalente aqui são os grupos por letra da lista.
- Lista de bairros: 219 nomes da listagem por CEP do RuaCEP. **Não é lista oficial**: o gabinete deve conferir.

## Busca por CEP (09/11/2026)
- O campo agora se chama "Buscar por bairro ou CEP". Letras → busca de bairro como antes; números → modo CEP com máscara 00000-000.
- Com 8 dígitos consulta o ViaCEP (`https://viacep.com.br/ws/<cep>/json/`, sem chave, limite de 8 s). Código-base enviado pelo usuário, adaptado para o formulário.
- Trava de Americana-SP em dois pontos: faixa 13465-000 a 13479-999 (recusa sem consultar) e `localidade`/`uf` da resposta.
- Achando: escolhe o bairro na lista (nome igual sem acento, depois um contido no outro); se não houver, usa "Outro" com o nome vindo do CEP. Preenche a rua só se o campo estiver vazio ou ainda com o texto automático, e pede o número da casa. Mostra cartão com rua, bairro, cidade, DDD e mapa (Google Maps embutido + link).
- Mensagens: "Buscando endereço...", "CEP não encontrado.", "Este buscador atende apenas endereços da cidade de Americana-SP.", "Erro ao consultar o CEP. Verifique sua conexão." (todas oferecem buscar pelo nome do bairro).
- O servidor libera na política de segurança (CSP) `connect-src https://viacep.com.br` e `frame-src https://maps.google.com https://www.google.com`.
- **Demonstração publicada:** a página não pode acessar outros sites, então ao digitar um CEP ela explica que a consulta só funciona no portal publicado (`window.__CEP_DEMO`).
- Testado com respostas simuladas do ViaCEP (o serviço não era acessível do ambiente de desenvolvimento). Fazer um teste real com um CEP de Americana assim que o portal estiver no ar.
- O CEP não é gravado na demanda (só bairro e rua). Se o gabinete quiser o CEP no painel e na Indicação, é preciso acrescentar o campo no envio e no banco.

## Ajustes para celular (09/11/2026)
- Auditoria automática em 320, 375, 425 e 768 px: rolagem lateral, alvos de toque abaixo de 44 px e fontes abaixo de 12 px.
- **Painel:** a página toda rolava para o lado em todas as larguras porque o filtro "Bairro" (um `<select>`) crescia até o nome mais longo. Corrigido com `min-width: 0; max-width: 100%` nos filtros e colunas `minmax(min(150px, 100%), 1fr)`. Abaixo de 600 px o relatório vira cartões (rótulos vêm de `data-label` em `painel.js`) e os números ficam 2 por linha.
- **Formulário:** até 425 px os botões de categoria mostram ícone em cima e texto embaixo (antes cortavam "acessibilidade" e "sinalização"); botão "Usar minha localização" com 44 px.
- **Demonstração:** abas com rótulo curto no celular ("Painel"), folha A4 da Indicação reduzida para caber na tela (botão "Ver em tamanho real"), alvos de toque de 44 px.
- Rede de segurança em todas as páginas: `overflow-x: clip` em `html, body` e mídia com `max-width: 100%; height: auto`.

## Decisões técnicas
- **Servidor sem dependências npm:** Node ≥ 22.5 nativo (`node:sqlite`, `FormData` nativo para upload). O npm estava bloqueado no ambiente de desenvolvimento, e isso também simplifica a instalação na Câmara.
- **Documento:** python-docx preenche marcadores `{chave}` em qualquer `.docx`, preservando a formatação; o PDF sai pelo LibreOffice.
- **Protocolo:** `LL-AAAA-NNNNNN`, sequencial por ano, gerado em transação junto com a gravação, sem buracos.
- **Automações:** fila em banco com reenvio (1 min a 24 h, 8 tentativas). Tipos: documento, gabinete, whatsapp, email, email_gabinete.
- **Painel:** login HTTP Basic (`PAINEL_USUARIO`/`PAINEL_SENHA`), gráficos em HTML/CSS puro (sem CDN).
- **Identidade visual:**
  - cores (do Instagram): marinho `#012355`/`#023475`, azul `#0F5398`, ciano `#23B7F2`, limão `#A2CF0A`;
  - fundo da página com brilhos da marca + malha de pontos; silhueta de cidade no topo (16/11/2026);
  - fontes: Sora e Instrument Sans.
- **Identificação:** topo "Gabinete Lucas Leoncine", foto do vereador (`public/assets/vereador.jpg`) e bandeira de Americana no rodapé (`public/assets/bandeira-americana.png`). As imagens ficam no zip do projeto (o Projeto não guarda imagens).

## Pendências com o usuário (bloqueiam a publicação)
- [x] **Modelo oficial de Indicação**: aplicado a partir das Indicações protocoladas (15/11/2026).
- [ ] **IA da Indicação** (opcional): chave `ANTHROPIC_API_KEY` no `.env` e `IA_PROVEDOR=anthropic`.
- [x] **Foto do vereador** recebida e aplicada (04/11/2026).
- [x] **Bandeira de Americana** no rodapé (04/11/2026).
- [~] **Lista de bairros**: 219 nomes (RuaCEP) com busca; conferir com a lista oficial da Prefeitura.
- [ ] **Sistema do gabinete**: se for planilha, instalar `scripts/apps-script-gabinete.gs`.
- [ ] **Provedor de WhatsApp**: meta, zapi ou evolution; preencher o `.env`.
- [ ] **Domínio e servidor** para publicar (Docker + Caddy prontos).
- [x] **Paleta**: aplicada a partir do Instagram (13/11/2026); limão escurecido a pedido (16/11/2026).

## Possíveis próximos passos (se o gabinete quiser)
- Mapa de calor das demandas por coordenada no painel.
- Vários usuários no painel, com registro de quem alterou cada demanda.
- Envio da Indicação direto para o sistema legislativo da Câmara, se houver API.
