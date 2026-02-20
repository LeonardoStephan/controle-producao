const { getAppHash, post } = require('./viaonda.client');
const { buscarOP } = require('./viaonda.op');

const ETIQUETAS_CACHE_TTL_MS = Number(process.env.VIAONDA_ETIQUETAS_CACHE_TTL_MS || 60_000);
const etiquetasPorCodigoCache = new Map();
const etiquetasPorCodigoInFlight = new Map();
const etiquetasPorOpCache = new Map();
const etiquetasPorOpInFlight = new Map();
const etiquetasPorSerieCache = new Map();
const etiquetasPorSerieInFlight = new Map();

function cacheKeyEtiqueta(codProdutoOmie, empresa) {
  return `${String(empresa || '').trim()}::${String(codProdutoOmie || '').trim()}`;
}

function cacheKeyOp(numeroOP, empresa) {
  return `${String(empresa || '').trim()}::${String(numeroOP || '').trim()}`;
}

function cacheKeySerie(serial) {
  return String(serial || '').trim();
}

function normalizeSerialInput(serial) {
  const raw = String(serial || '').trim();
  if (!raw) return '';

  // aceita entrada em formatos variados e tenta usar apenas digitos
  const afterDash = raw.includes('-') ? raw.split('-').pop() : raw;
  const digits = String(afterDash || '').replace(/\D/g, '');
  return digits || raw;
}

async function buscarEtiquetaProdutoFinal(numeroOP, empresa) {
  const op = String(numeroOP || '').trim();
  const emp = String(empresa || '').trim();
  if (!op) return [];

  const key = cacheKeyOp(op, emp);
  const now = Date.now();
  const cached = etiquetasPorOpCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const inFlight = etiquetasPorOpInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const response = await post(
        'http://restrito.viaondarfid.com.br/api/reimprimir_etiqueta.php',
        {
          appHash: getAppHash(emp),
          numOrdemProducao: op
        }
      );

      const value =
        response?.data?.response_code === '200' && Array.isArray(response?.data?.data)
          ? response.data.data
          : [];

      etiquetasPorOpCache.set(key, { value, expiresAt: now + ETIQUETAS_CACHE_TTL_MS });
      return value;
    } catch (err) {
      console.error('ViaOnda erro ao buscar etiquetas por OP:', err.message);
      return [];
    } finally {
      etiquetasPorOpInFlight.delete(key);
    }
  })();

  etiquetasPorOpInFlight.set(key, promise);
  return promise;
}

async function buscarEtiquetaSubproduto(numeroOP, serie, empresa) {
  const etiquetas = await buscarOP(numeroOP, empresa);
  if (!etiquetas) return false;
  return etiquetas.some(e => e.serie === serie);
}

async function viaOndaTemEtiqueta(codProdutoOmie, empresa) {
  const codigo = String(codProdutoOmie || '').trim();
  if (!codigo) return false;
  const etiquetas = await buscarEtiquetasPorCodigo(codigo, empresa);
  if (etiquetas === null) return null;
  return Array.isArray(etiquetas) && etiquetas.length > 0;
}

async function buscarEtiquetasPorCodigo(codProdutoOmie, empresa) {
  const codigo = String(codProdutoOmie || '').trim();
  const emp = String(empresa || '').trim();
  if (!codigo) return [];

  const key = cacheKeyEtiqueta(codigo, emp);
  const now = Date.now();
  const cached = etiquetasPorCodigoCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const inFlight = etiquetasPorCodigoInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const response = await post(
        'http://restrito.viaondarfid.com.br/api/reimprimir_etiqueta.php',
        {
          appHash: getAppHash(emp),
          codProduto: codigo
        }
      );

      const value =
        response?.data?.response_code === '200' && Array.isArray(response?.data?.data)
          ? response.data.data
          : [];

      etiquetasPorCodigoCache.set(key, { value, expiresAt: now + ETIQUETAS_CACHE_TTL_MS });
      return value;
    } catch (err) {
      console.error('ViaOnda erro ao buscar etiquetas por código:', err.message);
      return null;
    } finally {
      etiquetasPorCodigoInFlight.delete(key);
    }
  })();

  etiquetasPorCodigoInFlight.set(key, promise);
  return promise;
}

async function viaOndaTemSerie(codProdutoOmie, serie, empresa) {
  const etiquetas = await buscarEtiquetasPorCodigo(codProdutoOmie, empresa);
  if (etiquetas === null) return null;
  const serieNorm = String(serie || '').trim();
  return etiquetas.some((e) => String(e?.serie || '').trim() === serieNorm);
}

async function consultarEtiquetaNfePorSerie(serial) {
  const serialNorm = normalizeSerialInput(serial);
  if (!serialNorm) return null;

  const key = cacheKeySerie(serialNorm);
  const now = Date.now();
  const cached = etiquetasPorSerieCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const inFlight = etiquetasPorSerieInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const response = await post(
        'http://restrito.viaondarfid.com.br/api/consulta_nfe_etiqueta.php',
        {
          qtdeSeries: '1',
          productSerial: [{ serial: serialNorm }]
        }
      );

      if (String(response?.data?.response_code || '') !== '200') {
        etiquetasPorSerieCache.set(key, { value: null, expiresAt: now + ETIQUETAS_CACHE_TTL_MS });
        return null;
      }

      const lista = Array.isArray(response?.data?.data) ? response.data.data : [];
      const item = lista[0] || null;

      const value = item
        ? {
            serialConsulta: serialNorm,
            serie: String(item.serie || '').trim() || null,
            // codigo = codigo comercial (ex.: M-ID10W-V6-TCP-SPI), usado no Omie/BOM
            codProdutoOmie: String(item.codigo || '').trim() || null,
            // cod_produto = identificador interno numérico da etiquetadora
            codProdutoInterno: String(item.cod_produto || '').trim() || null,
            descricaoProduto: String(item.descricao_produto || '').trim() || null,
            numeroOP: String(item.num_ordem_producao || '').trim() || null,
            dataFaturamento: item.data_faturamento || null,
            raw: item
          }
        : null;

      etiquetasPorSerieCache.set(key, { value, expiresAt: now + ETIQUETAS_CACHE_TTL_MS });
      return value;
    } catch (err) {
      console.error('ViaOnda erro ao consultar NFe/etiqueta por série:', err.message);
      return null;
    } finally {
      etiquetasPorSerieInFlight.delete(key);
    }
  })();

  etiquetasPorSerieInFlight.set(key, promise);
  return promise;
}

module.exports = {
  buscarEtiquetaProdutoFinal,
  buscarEtiquetaSubproduto,
  viaOndaTemEtiqueta,
  buscarEtiquetasPorCodigo,
  viaOndaTemSerie,
  consultarEtiquetaNfePorSerie,
  normalizeSerialInput
};
