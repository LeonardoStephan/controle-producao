const axios = require('axios');
const { getOmieCredenciais } = require('../../config/omie.config');
const { getBrParts } = require('../../utils/timeZoneBr');
const { getCache, setCache } = require('./omie.cache');

const CACHE_TTL_MS = 60 * 1000;
const inflight = new Map();

function formatarDataOmie(date = new Date()) {
  const dt = getBrParts(date) || {
    day: date.getDate(),
    month: date.getMonth() + 1,
    year: date.getFullYear()
  };

  const dd = String(dt.day).padStart(2, '0');
  const mm = String(dt.month).padStart(2, '0');
  const yyyy = dt.year;
  return `${dd}/${mm}/${yyyy}`;
}

function normalizarTexto(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function cacheKey(codProdutoOmie, empresa) {
  return `omie:estoque:${String(empresa || '').trim().toLowerCase()}:${String(codProdutoOmie || '').trim()}`;
}

async function consultarEstoquePadrao(codProdutoOmie, empresa) {
  const { appKey, appSecret } = getOmieCredenciais(empresa);
  const key = cacheKey(codProdutoOmie, empresa);

  const cached = getCache(key);
  if (cached) return cached;

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  try {
    const req = axios
      .post(
        'https://app.omie.com.br/api/v1/estoque/resumo/',
        {
          call: 'ObterEstoqueProduto',
          param: [
            {
              cEAN: '',
              nIdProduto: 0,
              cCodigo: String(codProdutoOmie),
              xCodigo: '',
              dDia: formatarDataOmie(new Date())
            }
          ],
          app_key: appKey,
          app_secret: appSecret
        },
        { timeout: 20000 }
      )
      .then((response) => {
        const lista = response.data?.listaEstoque || [];
        const alvo = normalizarTexto('Local de Estoque Padrao');
        const payload = lista.find((e) => normalizarTexto(e.cDescricaoLocal) === alvo) || null;
        if (payload) setCache(key, payload, CACHE_TTL_MS);
        return payload;
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, req);
    return await req;
  } catch (err) {
    inflight.delete(key);
    console.error('Omie ObterEstoqueProduto:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { consultarEstoquePadrao };
