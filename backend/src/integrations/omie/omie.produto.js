// src/integrations/omie/omie.produto.js
const { postOmie } = require('./omie.http');

const ENDPOINT_PRODUTOS = 'https://app.omie.com.br/api/v1/geral/produtos/';
const CACHE_TTL_MS = 10 * 60 * 1000;
const produtoCache = new Map();

function cacheKey(codProduto, empresa) {
  return `${String(empresa || '').trim()}::${String(codProduto || '').trim()}`;
}

function extrairPayloadProduto(data) {
  if (!data || typeof data !== 'object') return null;
  return data.produto_cadastro || data.produto || data;
}

function extrairCodigoProduto(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return String(
    payload.codigo ||
      payload.codigo_produto ||
      payload.cCodigo ||
      payload.codigo_item ||
      ''
  ).trim();
}

function extrairDescricaoProduto(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return String(
    payload.descricao ||
      payload.descricao_produto ||
      payload.nome ||
      payload.nome_fantasia ||
      ''
  ).trim();
}

function extrairFamiliaProduto(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const candidatos = [
    payload.descrFam,
    payload.descricao_familia,
    payload.descricaoFamilia,
    payload.familia,
    payload.familia_produto,
    payload.cDescricaoFamilia
  ];

  for (const valor of candidatos) {
    const txt = String(valor || '').trim();
    if (txt) return txt;
  }

  return '';
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

  const payload = extrairPayloadProduto(resp.data);
  const codigoResp = extrairCodigoProduto(payload);
  if (!codigoResp) return false;

  return codigoResp === cod;
}

async function consultarProdutoNoOmie(codProduto, empresa) {
  const cod = String(codProduto || '').trim();
  const emp = String(empresa || '').trim();
  if (!cod || !emp) return null;

  const key = cacheKey(cod, emp);
  const now = Date.now();
  const cached = produtoCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const tentativas = [{ codigo: cod }];
  if (/^\d+$/.test(cod)) {
    const n = Number(cod);
    if (Number.isFinite(n)) {
      tentativas.push({ nCodProd: n });
      tentativas.push({ nCodProduto: n });
    }
  }

  let lastNonNotFoundError = null;
  for (const p of tentativas) {
    const resp = await postOmie({
      endpoint: ENDPOINT_PRODUTOS,
      empresa: emp,
      call: 'ConsultarProduto',
      param: [p],
      timeout: 40000
    });

    if (!resp.ok) {
      if (resp.error?.isNotFound) continue;
      lastNonNotFoundError = resp.error;
      continue;
    }

    const payload = extrairPayloadProduto(resp.data);
    const codigoResp = extrairCodigoProduto(payload);
    if (!codigoResp) continue;

    const descricao = extrairDescricaoProduto(payload);
    const value = {
      codigo: codigoResp,
      descricao: descricao || null,
      familia: extrairFamiliaProduto(payload) || null
    };

    produtoCache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  }

  if (lastNonNotFoundError) {
    throw new Error('FALHA_OMIE_CONSULTAR_PRODUTO');
  }
  return null;
}

module.exports = { validarProdutoExisteNoOmie, consultarProdutoNoOmie };
