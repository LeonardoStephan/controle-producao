// src/integrations/omie/omie.produto.js
const { postOmie } = require('./omie.http');

const ENDPOINT_PRODUTOS = 'https://app.omie.com.br/api/v1/geral/produtos/';
const CACHE_TTL_MS = 10 * 60 * 1000;
const produtoCache = new Map();

function cacheKey(codProduto, empresa) {
  return `${String(empresa || '').trim()}::${String(codProduto || '').trim()}`;
}

async function validarProdutoExisteNoOmie(codProduto, empresa) {
  const cod = String(codProduto || '').trim();
  const emp = String(empresa || '').trim();
  if (!cod || !emp) return false;

  const resp = await postOmie({
    endpoint: ENDPOINT_PRODUTOS,
    empresa: emp,
    call: 'ConsultarProduto',
    param: [{ codigo: cod }],
    timeout: 40000
  });

  if (!resp.ok) {
    if (resp.error?.isNotFound) return false;
    throw new Error('FALHA_OMIE_CONSULTAR_PRODUTO');
  }

  const data = resp.data;
  if (!data) return false;

  if (String(data.codigo || '').trim() === cod) return true;
  if (data.codigo_produto) return true;

  return true;
}

async function consultarProdutoNoOmie(codProduto, empresa) {
  const cod = String(codProduto || '').trim();
  const emp = String(empresa || '').trim();
  if (!cod || !emp) return null;

  const key = cacheKey(cod, emp);
  const now = Date.now();
  const cached = produtoCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const resp = await postOmie({
    endpoint: ENDPOINT_PRODUTOS,
    empresa: emp,
    call: 'ConsultarProduto',
    param: [{ codigo: cod }],
    timeout: 40000
  });

  if (!resp.ok) {
    if (resp.error?.isNotFound) return null;
    throw new Error('FALHA_OMIE_CONSULTAR_PRODUTO');
  }

  const data = resp.data || {};
  const codigo = String(data.codigo || data.codigo_produto || '').trim() || cod;

  const descricao = String(
    data.descricao ||
      data.descricao_produto ||
      data.nome ||
      data.nome_fantasia ||
      ''
  ).trim();

  const value = {
    codigo,
    descricao: descricao || null
  };

  produtoCache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

module.exports = { validarProdutoExisteNoOmie, consultarProdutoNoOmie };
