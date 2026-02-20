const { postOmie } = require('./omie.http');
const { getCache, setCache } = require('./omie.cache');

const ENDPOINT_MALHA = 'https://app.omie.com.br/api/v1/geral/malha/';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

function cacheKeyEstrutura(empresa, codProdutoOmie) {
  return `omie:estrutura:${String(empresa || '').trim()}:${String(codProdutoOmie || '').trim()}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterMs(min = 300, max = 700) {
  const lo = Math.max(0, Number(min) || 0);
  const hi = Math.max(lo, Number(max) || lo);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function isErroTransitórioOmie(error) {
  const statusCode = Number(error?.statusCode || 0);
  if (statusCode === 429) return true;
  if (statusCode >= 500 && statusCode < 600) return true;

  const fault = String(error?.fault || '').toLowerCase();
  if (fault.includes('timeout') || fault.includes('timed out')) return true;

  const raw = String(error?.raw || '').toLowerCase();
  if (raw.includes('timeout') || raw.includes('timed out')) return true;

  return false;
}

async function consultarEstruturaProduto(codProdutoOmie, empresa) {
  const cod = String(codProdutoOmie || '').trim();
  const emp = String(empresa || '').trim();
  if (!cod || !emp) return null;

  const key = cacheKeyEstrutura(emp, cod);
  const cached = getCache(key);
  if (cached) return cached;

  let lastResp = null;
  const tentativas = 2; // 1 tentativa inicial + 1 retry

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    const resp = await postOmie({
      endpoint: ENDPOINT_MALHA,
      empresa: emp,
      call: 'ConsultarEstrutura',
      param: [{ codProduto: cod }],
      timeout: 40000
    });

    if (resp.ok) {
      setCache(key, resp.data || null, CACHE_TTL_MS);
      return resp.data || null;
    }

    lastResp = resp;

    const deveRetentar =
      tentativa < tentativas &&
      isErroTransitórioOmie(resp.error);

    if (!deveRetentar) break;
    await sleep(jitterMs(300, 700));
  }

  const err = new Error('FALHA_OMIE_CONSULTAR_ESTRUTURA');
  if (lastResp?.error) err.details = lastResp.error;
  throw err;
}

function extrairSubprodutosDoBOM(bomData) {
  const itens = Array.isArray(bomData?.itens) ? bomData.itens : [];

  return itens
    .filter((i) => String(i.descrFamMalha || '').trim() === 'SubProduto')
    .map((i) => ({
      codigo: String(i.codProdMalha || '').trim(),
      qtdPorUnidade: Number(i.quantProdMalha || 0)
    }))
    .filter((i) => i.codigo && i.qtdPorUnidade > 0);
}

function extrairDescrFamiliaIdent(bomData) {
  return String(bomData?.ident?.descrFamilia || '').trim();
}

/**
 * Retorna um map { codigoSubproduto => quantidadeObrigatoriaNoBOM }
 * Considera subproduto quando item.descrFamMalha === 'SubProduto'
 */
async function obterObrigatoriosSubprodutosDoBOM(codProdutoOmie, empresa) {
  const estrutura = await consultarEstruturaProduto(codProdutoOmie, empresa);
  const itens = Array.isArray(estrutura?.itens) ? estrutura.itens : [];

  const obrigatorios = {};
  for (const item of itens) {
    const familia = String(item.descrFamMalha || '').trim();
    if (familia !== 'SubProduto') continue;

    const codigo = String(item.codProdMalha || '').trim();
    if (!codigo) continue;

    const qtd = Number(item.quantProdMalha || 0);
    obrigatorios[codigo] = (obrigatorios[codigo] || 0) + (qtd > 0 ? qtd : 0);
  }

  return obrigatorios; // pode vir {} (não exige subproduto)
}

async function estruturaTemItem(codProdutoOmie, empresa, codigoItem) {
  // Sem codProdutoOmie não dá pra validar BOM -> não bloqueia (mesma regra da peça)
  if (!codProdutoOmie) return true;

  const estrutura = await consultarEstruturaProduto(codProdutoOmie, empresa);
  const itens = Array.isArray(estrutura?.itens) ? estrutura.itens : [];

  const cod = String(codigoItem || '').trim();
  if (!cod) return false;

  return itens.some((item) => String(item.codProdMalha || '').trim() === cod);
}


module.exports = {
  consultarEstruturaProduto,
  extrairSubprodutosDoBOM,
  extrairDescrFamiliaIdent,
  obterObrigatoriosSubprodutosDoBOM,
  estruturaTemItem
};
