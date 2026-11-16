/**
 * Portal de Demandas — Vereador Lucas Leoncine (Americana/SP)
 * Configuração editável pelo gabinete. Não exige conhecimento de programação:
 * altere textos, bairros e categorias aqui.
 */
window.PORTAL_CONFIG = {
  vereador: {
    nome: "Lucas Leoncine",
    titulo: "Gabinete Lucas Leoncine", // nome exibido no topo do portal
    cargo: "Vereador",
    cidade: "Americana/SP",
    slogan: "Construindo hoje a cidade inteligente do amanhã",
    whatsappGabinete: "5519999845200",
    instagram: "https://www.instagram.com/lucasleoncine",
    foto: "assets/vereador.jpg" // substitua pelo arquivo oficial (quadrado, mín. 400x400)
  },

  // Endpoint da API. Com o servidor no ar, deixe o modo demonstração em false:
  // assim, se a API cair, o cidadão vê um erro claro em vez de um protocolo falso.
  apiUrl: "/api/demandas",
  modoDemonstracaoSeApiIndisponivel: false,

  // Limites de upload
  foto: { maxMB: 10, larguraMaxima: 1600, qualidadeJpeg: 0.82 },

  // Bairros e loteamentos de Americana (219 nomes, base: RuaCEP — listagem por CEP,
  // não oficial). O cidadão escolhe na lista ou busca digitando; a opção "Outro" é adicionada automaticamente.
  // ⚠️ O gabinete pode conferir com a lista oficial da Prefeitura: basta apagar ou
  // acrescentar nomes aqui (um por linha, entre aspas, terminando com vírgula).
  bairros: [
    "Antônio Zanaga", "Antônio Zanaga I", "Antônio Zanaga II", "Bairro da Lagoa",
    "Bairro Pacaembu", "Balneário Riviera", "Balneário Salto Grande", "Barroca",
    "Boa Esperança", "Bom Recreio", "Bosque da Saúde", "Bosque dos Ipês",
    "Brieds", "Campo Limpo", "Campo Verde", "Carioba",
    "Cariobinha", "Catharina Zanaga", "Cechino", "Centro",
    "Chácara Girassol", "Chácara Letônia", "Chácara Lucília", "Chácara Machadinho I",
    "Chácara Machadinho II", "Chácara Machado", "Chácara Mantovani", "Chácara Rodrigues",
    "Chácaras Alto da Represa", "Chácaras São Francisco", "Cidade Jardim", "Cidade Jardim I",
    "Cidade Jardim II", "Colina Werner Plaas", "Conserva", "Fazendinha",
    "Iate Clube de Americana", "Industrial Maria Joana Crivelloni Abrão", "Industrial Nossa Senhora de Fátima 2.ª Parte", "Industrial Sigisfredo Boer",
    "Jardim Alvorada", "Jardim Amélia", "Jardim América", "Jardim América II",
    "Jardim Bazanelli", "Jardim Bela Vista", "Jardim Bertoni", "Jardim Boer I",
    "Jardim Boer II", "Jardim Brasil", "Jardim Brasília", "Jardim Campo Belo",
    "Jardim da Balsa I", "Jardim da Balsa II", "Jardim da Colina", "Jardim da Mata",
    "Jardim da Paz", "Jardim das Flores", "Jardim das Orquídeas", "Jardim Dona Judith",
    "Jardim dos Lírios", "Jardim Esplanada", "Jardim Glória", "Jardim Governador Mário Covas II",
    "Jardim Governador Mário Covas III", "Jardim Guanabara", "Jardim Helena", "Jardim Imperador",
    "Jardim Ipiranga", "Jardim Jacyra", "Jardim Lizandra", "Jardim Luciane",
    "Jardim Marcia Cristina", "Jardim Mirandola", "Jardim Miriam", "Jardim Nielsen Ville",
    "Jardim Nossa Senhora Aparecida", "Jardim Nossa Senhora de Fátima", "Jardim Nossa Senhora do Carmo", "Jardim Nova Aliança",
    "Jardim Novo Girassol", "Jardim Novo Horizonte", "Jardim Novo Paraíso", "Jardim Pau Brasil",
    "Jardim Paulista", "Jardim Paulistano", "Jardim Phillipson Park", "Jardim Portal da Colina",
    "Jardim Primavera", "Jardim Progresso", "Jardim Recanto", "Jardim Residencial Dona Rosa",
    "Jardim Santa Eliza", "Jardim Santa Lúcia", "Jardim Santa Mônica", "Jardim Santana",
    "Jardim Santo Antônio", "Jardim São Domingos", "Jardim São Domingos I", "Jardim São Domingos II",
    "Jardim São José", "Jardim São Paulo", "Jardim São Roque", "Jardim São Vito",
    "Jardim Terramérica I", "Jardim Terramérica II", "Jardim Terramérica III", "Jardim Thelja",
    "Jardim Tonica", "Jardim Trípoli", "Jardim Werner Plaas", "Jardim Werner Plaas VII",
    "Leitão", "Loteamento Industrial 9 de Julho", "Loteamento Industrial Machadinho", "Loteamento Industrial Nossa Senhora de Fátima",
    "Loteamento Residencial de Interesse Social Vila Nova Esperança - ASTA 4", "Loteamento Residencial Industrial João Santarosa", "Loteamento Residencial Jardim dos Ipês Amarelos", "Loteamento Residencial Jardim dos Pinheiros",
    "Loteamento Residencial Jardim Esperança", "Loteamento Residencial Jardim Florbela", "Loteamento Residencial Jardim Jacyra", "Loteamento Residencial Jardim Villagio",
    "Loteamento Residencial Jardim Villagio II", "Monte Carlo", "Morada do Sol", "Nova Americana",
    "Olho D'Água", "Paraíso", "Parque das Nações", "Parque Dom Pedro II",
    "Parque Gramado", "Parque Ideal", "Parque Industrial Jair Faraone Zanaga 3", "Parque Liberdade",
    "Parque Mangueira", "Parque Nova Carioba", "Parque Novo Mundo", "Parque Primavera",
    "Parque Residencial Boa Vista", "Parque Residencial Jaguari", "Parque Residencial Nardini", "Parque Residencial Tancredi",
    "Parque São Jerônimo", "Parque Universitário", "Portal dos Nobres", "Praia Azul",
    "Praia dos Namorados", "Recanto", "Recanto Jatobá", "Recanto Vista Alegre",
    "Remanso Azul", "Residencial Horto Florestal Jacyra I", "Residencial Jardim Barra do Cisne I", "Residencial Praia dos Namorados",
    "Residencial Santa Paula", "Residencial Vale das Nogueiras", "Riviera Tamborlim", "Salto Grande",
    "Santa Cruz", "Santa Sofia", "São Benedito", "São Domingos",
    "São Jerônimo", "São José", "São Luiz", "São Manoel",
    "São Sebastião", "São Vito", "São Vitor", "Tapera",
    "Vale das Paineiras", "Vale do Rio Branco", "Vila Amorim", "Vila Bela",
    "Vila Belvedere", "Vila Bertini", "Vila Biasi", "Vila Branca",
    "Vila Camargo", "Vila Conquista", "Vila Cordenonsi", "Vila Dainese",
    "Vila Franciscângelis", "Vila Frezzarim", "Vila Frezzarim 2º Loteamento", "Vila Galo",
    "Vila Gobbo", "Vila Israel", "Vila Jones", "Vila Lourdes",
    "Vila Louricilda", "Vila Margarida", "Vila Mariana", "Vila Massucheto",
    "Vila Mathiesen", "Vila Maule", "Vila Medon", "Vila Molon",
    "Vila Najar", "Vila Nossa Senhora de Fátima", "Vila Nura", "Vila Omar",
    "Vila Pavan", "Vila Rehder", "Vila Rio Branco", "Vila San Pietro",
    "Vila Santa Catarina", "Vila Santa Inês", "Vila Santa Maria", "Vila Santa Mônica",
    "Vila SantAngelo", "Vila Santo Antônio", "Vila São Manoel", "Vila São Pedro",
    "Vila São Vito", "Vila Vitória", "Vila Zanini"
  ],

  // id = valor gravado no banco (não altere depois de entrar em produção)
  categorias: [
    { id: "iluminacao",   nome: "Iluminação",      icone: "luz" },
    { id: "tapa_buracos", nome: "Tapa-buracos",     icone: "buraco" },
    { id: "saude",        nome: "Saúde",            icone: "saude" },
    { id: "limpeza",      nome: "Limpeza urbana",   icone: "limpeza" },
    { id: "poda_arvore",  nome: "Poda de árvore",   icone: "arvore" },
    { id: "transito",     nome: "Trânsito e sinalização", icone: "transito" },
    { id: "calcada",      nome: "Calçadas e acessibilidade", icone: "calcada" },
    { id: "seguranca",    nome: "Segurança",        icone: "seguranca" },
    { id: "educacao",     nome: "Educação",         icone: "educacao" },
    { id: "outros",       nome: "Outros",           icone: "outros" }
  ]
};
