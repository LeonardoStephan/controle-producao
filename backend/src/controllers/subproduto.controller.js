const registrarSubprodutoUseCase = require('../usecases/subproduto/registrarSubproduto.usecase');
const consumirSubprodutoUseCase = require('../usecases/subproduto/consumirSubproduto.usecase');

const registrarSubproduto = async (req, res) => {
  const result = await registrarSubprodutoUseCase.execute(req.body);
  return res.status(result.status).json(result.body);
};

const consumirSubproduto = async (req, res) => {
  const result = await consumirSubprodutoUseCase.execute(req.body);
  return res.status(result.status).json(result.body);
};

module.exports = {
  registrarSubproduto,
  consumirSubproduto
};
