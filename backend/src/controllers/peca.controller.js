const consumirPecaUseCase = require('../usecases/peca/consumirPeca.usecase');
const substituirPecaUseCase = require('../usecases/peca/substituirPeca.usecase');
const historicoPecasUseCase = require('../usecases/peca/historicoPecas.usecase');

const consumirPeca = async (req, res) => {
  const result = await consumirPecaUseCase.execute(req.body);
  return res.status(result.status).json(result.body);
};

const substituirPeca = async (req, res) => {
  const result = await substituirPecaUseCase.execute(req.body);
  return res.status(result.status).json(result.body);
};

const historicoPecas = async (req, res) => {
  const result = await historicoPecasUseCase.execute(req.query);
  return res.status(result.status).json(result.body);
};

module.exports = {
  consumirPeca,
  substituirPeca,
  historicoPecas
};
