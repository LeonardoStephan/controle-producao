const funcionarioRepo = require('../repositories/funcionario.repository');

async function carregarMapaNomePorCracha(crachas) {
  const rows = await funcionarioRepo.findManyByCracha(crachas);
  const mapa = new Map();
  for (const r of rows || []) {
    mapa.set(String(r.cracha || '').trim(), String(r.nome || '').trim() || String(r.cracha || '').trim());
  }
  return mapa;
}

function nomePorCrachaOuOriginal(cracha, mapa) {
  const c = String(cracha || '').trim();
  if (!c) return c;
  return mapa.get(c) || c;
}

module.exports = {
  carregarMapaNomePorCracha,
  nomePorCrachaOuOriginal
};
