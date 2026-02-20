const consumirPecaUseCase = require('../usecases/peca/consumirPeca.usecase');
const substituirPecaUseCase = require('../usecases/peca/substituirPeca.usecase');

const consumirPeca = async (req, res) => {
  const result = await consumirPecaUseCase.execute(req.body);
  return res.status(result.status).json(result.body);
};

const substituirPeca = async (req, res) => {
  const result = await substituirPecaUseCase.execute(req.body);
  return res.status(result.status).json(result.body);
};

module.exports = {
  consumirPeca,
  substituirPeca
};
