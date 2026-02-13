const FLUXO_MANUTENCAO = [
  'recebida',
  'conferencia_inicial',
  'conferencia_manutencao',
  'avaliacao_garantia',
  'aguardando_aprovacao',
  'reparo',
  'aguardando_envio',
  'finalizada'
];

const STATUS_TERMINAIS_MANUTENCAO = ['finalizada', 'devolvida', 'destruida', 'cancelada'];

function podeAvancar(statusAtual, proximoStatus) {
  const idxAtual = FLUXO_MANUTENCAO.indexOf(statusAtual);
  const idxProximo = FLUXO_MANUTENCAO.indexOf(proximoStatus);
  return idxAtual !== -1 && idxProximo === idxAtual + 1;
}

function proximoStatus(statusAtual) {
  const idx = FLUXO_MANUTENCAO.indexOf(statusAtual);
  if (idx === -1) return null;
  return FLUXO_MANUTENCAO[idx + 1] || null;
}

function etapasAteReparo(statusAtual) {
  const idxAtual = FLUXO_MANUTENCAO.indexOf(statusAtual);
  const idxReparo = FLUXO_MANUTENCAO.indexOf('reparo');
  if (idxAtual === -1 || idxReparo === -1 || idxAtual >= idxReparo) return [];
  return FLUXO_MANUTENCAO.slice(idxAtual + 1, idxReparo + 1);
}

module.exports = {
  FLUXO_MANUTENCAO,
  STATUS_TERMINAIS_MANUTENCAO,
  podeAvancar,
  proximoStatus,
  etapasAteReparo
};
