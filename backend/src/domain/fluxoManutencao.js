const FLUXO_MANUTENCAO = [
  'recebida',
  'conferencia_inicial',
  'conferencia_manutencao',
  'avaliacao_garantia',
  'aguardando_aprovacao',
  'reparo',
  'devolvida',
  'descarte',
  'embalagem',
  'finalizada'
];

const TRANSICOES_MANUTENCAO = {
  recebida: ['conferencia_inicial'],
  conferencia_inicial: ['conferencia_manutencao'],
  conferencia_manutencao: ['avaliacao_garantia'],
  avaliacao_garantia: ['aguardando_aprovacao'],
  aguardando_aprovacao: ['reparo', 'devolvida', 'descarte'],
  reparo: ['embalagem'],
  devolvida: ['embalagem'],
  descarte: ['finalizada'],
  embalagem: ['finalizada']
};

// Status finais (Não permitem mais alteracao)
const STATUS_TERMINAIS_MANUTENCAO = ['finalizada'];

function podeAvancar(statusAtual, proximoStatus) {
  const proximos = TRANSICOES_MANUTENCAO[String(statusAtual || '').trim()] || [];
  return proximos.includes(String(proximoStatus || '').trim());
}

function proximoStatus(statusAtual) {
  const proximos = TRANSICOES_MANUTENCAO[String(statusAtual || '').trim()] || [];
  return proximos[0] || null;
}

function etapasAteReparo(statusAtual) {
  const idxAtual = FLUXO_MANUTENCAO.indexOf(statusAtual);
  const idxReparo = FLUXO_MANUTENCAO.indexOf('reparo');
  if (idxAtual === -1 || idxReparo === -1 || idxAtual >= idxReparo) return [];
  return FLUXO_MANUTENCAO.slice(idxAtual + 1, idxReparo + 1);
}

module.exports = {
  FLUXO_MANUTENCAO,
  TRANSICOES_MANUTENCAO,
  STATUS_TERMINAIS_MANUTENCAO,
  podeAvancar,
  proximoStatus,
  etapasAteReparo
};
