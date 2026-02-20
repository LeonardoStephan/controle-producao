const { consultarPedidoVenda } = require('./omie.pedidoVenda');
const { consultarEstoquePadrao } = require('./omie.estoque');
const { consultarEstruturaProduto, extrairSubprodutosDoBOM, 
  obterObrigatoriosSubprodutosDoBOM, estruturaTemItem } = require('./omie.estrutura');
const { validarProdutoExisteNoOmie } = require('./omie.produto');
const { consultarOrdemServico, baixarPecaEstoqueOmie } = require('./omie.os');

module.exports = {
  consultarPedidoVenda,
  consultarEstoquePadrao,
  consultarEstruturaProduto,
  extrairSubprodutosDoBOM,
  obterObrigatoriosSubprodutosDoBOM,
  estruturaTemItem,
  validarProdutoExisteNoOmie,
  consultarOrdemServico,
  baixarPecaEstoqueOmie
};
