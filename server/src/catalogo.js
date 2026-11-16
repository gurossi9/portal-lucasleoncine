"use strict";
/**
 * Categorias e status. Os ids de categoria precisam bater com public/config.js.
 *
 * Indicação (padrão do gabinete, 2026):
 *   servico    → objeto da ementa: "Indica <servico> na Rua X, próximo ao número N, no bairro B."
 *   secretaria → setor da Prefeitura de Americana sugerido na triagem do painel (conferir).
 *   regras     → se o relato do munícipe tiver estas palavras, o serviço fica mais preciso
 *                (vale a primeira regra que bater). Regras em REGRAS_GERAIS valem para
 *                qualquer categoria (ex.: vazamento de água vai para o DAE).
 */
const SOSU = "Secretaria de Obras e Serviços Urbanos (SOSU)";
const MEIO_AMBIENTE = "Secretaria de Meio Ambiente";
const DAE = "DAE – Departamento de Água e Esgoto";
const TRANSITO = "Setor de Trânsito / Mobilidade Urbana";
const GAMA = "Secretaria de Segurança Pública e GAMA (Guarda Municipal)";

const CATEGORIAS = {
  iluminacao: {
    nome: "Iluminação", servico: "manutenção de iluminação pública", secretaria: SOSU,
    regras: [
      [/sem (nenhuma )?ilumina|n[aã]o (tem|h[aá]) (luz|ilumina|poste)|instala|novo poste|colocar (um )?poste|escur[oa] (a noite|à noite)?.*(pra[çc]a|viela)/i, "instalação de ponto de iluminação pública"],
      [/piscando|apagad|queimad|n[aã]o acende|l[aâ]mpada/i, "manutenção de iluminação pública (reparo/troca de lâmpada)"],
    ],
  },
  tapa_buracos: {
    nome: "Tapa-buracos", servico: "operação tapa-buraco (reparo asfáltico)", secretaria: SOSU,
    regras: [[/afund|cratera|cedeu|desmoron/i, "reparo asfáltico (recomposição de pavimento afundado)"]],
  },
  saude: { nome: "Saúde", servico: "providências na área da saúde", secretaria: "Secretaria de Saúde",
    regras: [[/\bubs\b|posto de sa[uú]de|unidade b[aá]sica|upa\b/i, "providências na unidade de saúde"],
             [/dengue|mosquito|criadouro|foco/i, "vistoria e combate a focos do mosquito da dengue"]] },
  limpeza: {
    nome: "Limpeza urbana", servico: "zeladoria (limpeza e remoção de resíduos)", secretaria: SOSU,
    regras: [
      [/boca de lobo|bueiro|canaleta|galeria|grelha/i, "zeladoria (limpeza de boca de lobo e canaleta de escoamento de água pluvial)"],
      [/entulho|descarte|desc?arregam|lixo jogado|m[oó]veis velhos/i, "zeladoria (remoção de entulho e resíduos descartados irregularmente)"],
      [/mato|capin|ro[çc]ad|terreno/i, "zeladoria (roçagem e limpeza de área com mato alto)"],
      [/c[oó]rrego|ribeir[aã]o|margem/i, "zeladoria (limpeza das margens do córrego)"],
    ],
  },
  poda_arvore: {
    nome: "Poda de árvore", servico: "poda de indivíduo arbóreo", secretaria: MEIO_AMBIENTE,
    regras: [[/remo[çc]|retirar|cortar a [aá]rvore|[aá]rvore (est[aá] )?(morta|seca|caindo|podre)|risco de (cair|queda)|tronco (rachado|podre|oco)|inclinad/i, "vistoria técnica e eventual remoção de indivíduo arbóreo"],
             [/fia[çc][aã]o|fio|rede el[eé]trica/i, "poda de indivíduo arbóreo em contato com a fiação"]],
  },
  transito: {
    nome: "Trânsito e sinalização", servico: "melhoria da sinalização de trânsito", secretaria: TRANSITO,
    regras: [
      [/lombada|redutor|quebra-?molas|alta velocidade|velocidade/i, "estudo para implantação de redutor de velocidade"],
      [/faixa|pintura|apagad|solo/i, "revitalização da sinalização horizontal (pintura de solo)"],
      [/placa|poste de sinaliza/i, "reposição de sinalização vertical (placas)"],
      [/sem[aá]foro/i, "manutenção de semáforo"],
    ],
  },
  calcada: {
    nome: "Calçadas e acessibilidade", servico: "reparo de passeio público (calçada)", secretaria: SOSU,
    regras: [[/rampa|cadeirante|acessib|guia rebaixada/i, "reparo de passeio público e adequação de acessibilidade"],
             [/raiz/i, "reparo de passeio público danificado por raiz de árvore"]],
  },
  seguranca: { nome: "Segurança", servico: "reforço do patrulhamento preventivo da Guarda Municipal", secretaria: GAMA, regras: [] },
  educacao: { nome: "Educação", servico: "providências na unidade escolar", secretaria: "Secretaria de Educação", regras: [] },
  outros: { nome: "Outros", servico: "providências", secretaria: "[DEFINIR SETOR]", regras: [] },
};

/** Valem para qualquer categoria e vêm antes das regras da categoria. */
const REGRAS_GERAIS = [
  [/vazamento|vazando|cano (estourad|quebrad|furad)|[aá]gua (limpa )?(escorrendo|jorrando|minando)/i, "manutenção em vazamento da rede de água", DAE],
  [/esgoto|fossa|mau cheiro de esgoto/i, "manutenção da rede de esgoto", DAE],
  [/falta d.?[aá]gua|sem [aá]gua/i, "verificação do abastecimento de água", DAE],
  [/sarjet[aã]o/i, "manutenção de sarjetão", SOSU],
];

/** Fluxo de atendimento. "aviso" é enviado ao munícipe quando o status muda. */
const STATUS = {
  recebida:      { nome: "Recebida",            aviso: null },
  em_analise:    { nome: "Em análise",          aviso: "A equipe do gabinete está analisando sua demanda." },
  protocolada:   { nome: "Indicação protocolada", aviso: "Sua demanda virou uma Indicação oficial na Câmara e foi encaminhada à Prefeitura." },
  em_execucao:   { nome: "Em execução",         aviso: "A Prefeitura informou que o serviço está em andamento." },
  atendida:      { nome: "Atendida",            aviso: "Sua demanda foi atendida! Obrigado por ajudar a cuidar da cidade." },
  nao_atendida:  { nome: "Não atendida",        aviso: "Infelizmente não foi possível atender sua demanda neste momento. Fale com o gabinete para saber mais." },
  arquivada:     { nome: "Arquivada",           aviso: null },
};

/** Serviço e setor para uma demanda (categoria + palavras do relato). */
function classificarServico(categoria, descricao = "") {
  const cat = CATEGORIAS[categoria] || CATEGORIAS.outros;
  for (const [re, servico, secretaria] of REGRAS_GERAIS) if (re.test(descricao)) return { servico, secretaria };
  for (const [re, servico] of cat.regras || []) if (re.test(descricao)) return { servico, secretaria: cat.secretaria };
  return { servico: cat.servico, secretaria: cat.secretaria };
}

module.exports = { CATEGORIAS, STATUS, REGRAS_GERAIS, classificarServico };
