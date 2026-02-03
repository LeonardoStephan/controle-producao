const axios = require('axios');
const { getOmieCredenciais } = require('../config/omie.config');

/* =========================
   OMIE – CONSULTAR PEDIDO DE VENDA
   Retorna itens normalizados
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

    // 🔁 Normalização dos itens
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
   OMIE – ESTOQUE PADRÃO
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
            cCodigo: codProdutoOmie,
            xCodigo: '',
            dDia: new Date().toISOString().slice(0, 10)
          }
        ],
        app_key: appKey,
        app_secret: appSecret
      },
      { timeout: 20000 }
    );

    const lista = response.data?.listaEstoque || [];

    return lista.find(
      (e) => e.cDescricaoLocal === 'Local de Estoque Padrão'
    ) || null;

  } catch (err) {
    console.error(
      '❌ Omie ObterEstoqueProduto:',
      err.response?.data || err.message
    );
    return null;
  }
}

module.exports = {
  consultarPedidoVenda,
  consultarEstoquePadrao
};
