const axios = require('axios');
const { getOmieCredenciais } = require('../../config/omie.config');
const { getCache, setCache } = require('./omie.cache');

const CACHE_TTL_MS = 2 * 60 * 1000;
const inflight = new Map();

function cacheKey(numeroPedido, empresa) {
  return `omie:pedido:${String(empresa || '').trim().toLowerCase()}:${String(numeroPedido || '').trim()}`;
}

async function consultarPedidoVenda(numeroPedido, empresa) {
  const { appKey, appSecret } = getOmieCredenciais(empresa);
  const key = cacheKey(numeroPedido, empresa);

  const cached = getCache(key);
  if (cached) return cached;

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  try {
    const req = axios
      .post(
        'https://app.omie.com.br/api/v1/produtos/pedido/',
        {
          call: 'ConsultarPedido',
          param: [{ numero_pedido: String(numeroPedido) }],
          app_key: appKey,
          app_secret: appSecret
        },
        { timeout: 20000 }
      )
      .then((response) => {
        const pedido = response.data?.pedido_venda_produto;

        if (!pedido || !pedido.det) return null;

        const itens = pedido.det.map((item) => ({
          codProdutoOmie: item.produto.codigo,
          descricao: item.produto.descricao,
          quantidade: Number(item.produto.quantidade)
        }));

        const payload = {
          numeroPedido: pedido.cabecalho.numero_pedido,
          cliente: pedido.informacoes_adicionais?.contato || '',
          itens
        };

        setCache(key, payload, CACHE_TTL_MS);
        return payload;
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, req);
    return await req;
  } catch (err) {
    inflight.delete(key);
    console.error('Omie ConsultarPedido:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { consultarPedidoVenda };
