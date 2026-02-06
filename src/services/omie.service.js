const axios = require('axios');
const { getOmieCredenciais } = require('../config/omie.config');

/* =========================
   HELPERS
========================= */
function formatarDataOmie(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`; // ✅ dd/mm/aaaa (exigido pelo Omie)
}

/* =========================
   OMIE – CONSULTAR PEDIDO DE VENDA
========================= */
async function consultarPedidoVenda(numeroPedido, empresa) {
  const { appKey, appSecret } = getOmieCredenciais(empresa);

  try {
    const response = await axios.post(
      'https://app.omie.com.br/api/v1/produtos/pedido/',
      {
        call: 'ConsultarPedido',
        param: [
          {
            numero_pedido: String(numeroPedido)
          }
        ],
        app_key: appKey,
        app_secret: appSecret
      },
      { timeout: 20000 }
    );

    const pedido = response.data?.pedido_venda_produto;

    if (!pedido || !pedido.det) {
      return null;
    }

    const itens = pedido.det.map((item) => ({
      codProdutoOmie: item.produto.codigo,
      descricao: item.produto.descricao,
      quantidade: Number(item.produto.quantidade)
    }));

    return {
      numeroPedido: pedido.cabecalho.numero_pedido,
      cliente: pedido.informacoes_adicionais?.contato || '',
      itens
    };
  } catch (err) {
    console.error(
      '❌ Omie ConsultarPedido:',
      err.response?.data || err.message
    );
    return null;
  }
}

/* =========================
   OMIE – BUSCAS NO ESTOQUE PADRÃO
========================= */
async function consultarEstoquePadrao(codProdutoOmie, empresa) {
  const { appKey, appSecret } = getOmieCredenciais(empresa);

  try {
    const response = await axios.post(
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
    );

    const lista = response.data?.listaEstoque || [];

    return (
      lista.find((e) => e.cDescricaoLocal === 'Local de Estoque Padrão') || null
    );
  } catch (err) {
    console.error(
      '❌ Omie ObterEstoqueProduto:',
      err.response?.data || err.message
    );
    return null;
  }
}

/* =========================
   OMIE – BUSCAS NA ESTRUTURA BOM
   EXTRAI ITENS QUE SÃO SUBPRODUTOS (descrFamMalha === "SubProduto")
========================= */

// cache por (empresa + codProdutoOmie)
const estruturaCache = new Map();
const CACHE_TEMPO = 5 * 60 * 1000;

async function consultarEstruturaProduto(codProdutoOmie, empresa) {
  if (!codProdutoOmie) return null;

  const cacheKey = `${empresa}_${codProdutoOmie}`;
  const cache = estruturaCache.get(cacheKey);

  if (cache && Date.now() - cache.timestamp < CACHE_TEMPO) {
    return cache.data;
  }

  const { appKey, appSecret } = getOmieCredenciais(empresa);

  try {
    const response = await axios.post(
      'https://app.omie.com.br/api/v1/geral/malha/',
      {
        call: 'ConsultarEstrutura',
        param: [{ codProduto: codProdutoOmie }],
        app_key: appKey,
        app_secret: appSecret
      },
      { timeout: 40000 }
    );

    const data = response.data || null;
    estruturaCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (err) {
    console.error('❌ Omie ConsultarEstrutura:', err.response?.data || err.message);
    throw new Error('FALHA_AO_CONSULTAR_ESTRUTURA_OMIE');
  }
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
    const familia = (item.descrFamMalha || '').trim();
    if (familia !== 'SubProduto') continue;

    const codigo = String(item.codProdMalha || '').trim();
    if (!codigo) continue;

    const qtd = Number(item.quantProdMalha || 0);
    obrigatorios[codigo] = (obrigatorios[codigo] || 0) + (qtd > 0 ? qtd : 0);
  }

  return obrigatorios; // pode vir {} (não exige subproduto)
}

module.exports = {
  consultarPedidoVenda,
  consultarEstoquePadrao,
  consultarEstruturaProduto,
  obterObrigatoriosSubprodutosDoBOM
};
