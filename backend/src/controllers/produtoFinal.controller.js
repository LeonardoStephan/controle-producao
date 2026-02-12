const criarProdutoFinalUseCase = require('../usecases/produtoFinal/criarProdutoFinal.usecase');

const criarProdutoFinal = async (req, res) => {
  const result = await criarProdutoFinalUseCase.execute(req.body);
  return res.status(result.status).json(result.body);
};

module.exports = { criarProdutoFinal };
