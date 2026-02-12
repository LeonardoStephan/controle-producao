const { consultarPedidoVenda } = require('./omie.pedidoVenda');
const { consultarEstoquePadrao } = require('./omie.estoque');
const { consultarEstruturaProduto, extrairSubprodutosDoBOM, 
  obterObrigatoriosSubprodutosDoBOM, estruturaTemItem } = require('./omie.estrutura');
const { validarProdutoExisteNoOmie } = require('./omie.produto');

module.exports = {
  consultarPedidoVenda,
  consultarEstoquePadrao,

  consultarEstruturaProduto,
  extrairSubprodutosDoBOM,
  obterObrigatoriosSubprodutosDoBOM,
  estruturaTemItem,

  validarProdutoExisteNoOmie
};
