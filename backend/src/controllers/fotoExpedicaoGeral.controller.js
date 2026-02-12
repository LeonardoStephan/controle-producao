const uploadFotoGeralUseCase = require('../usecases/expedicao/fotosGerais/uploadFotoGeral.usecase');
const listarFotosGeraisUseCase = require('../usecases/expedicao/fotosGerais/listarFotosGerais.usecase');

const uploadFotoGeral = async (req, res) => {
  const result = await uploadFotoGeralUseCase.execute(req.body);
  return res.status(result.status).json(result.body);
};

const listarFotosGerais = async (req, res) => {
  const result = await listarFotosGeraisUseCase.execute(req.params);
  return res.status(result.status).json(result.body);
};

module.exports = {
  uploadFotoGeral,
  listarFotosGerais
};
