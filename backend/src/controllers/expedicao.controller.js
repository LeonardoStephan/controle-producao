const iniciarExpedicaoUseCase = require('../usecases/expedicao/iniciarExpedicao.usecase');
const scanSerieUseCase = require('../usecases/expedicao/scanSerie.usecase');
const uploadFotoSerieUseCase = require('../usecases/expedicao/uploadFotoSerie.usecase');
const finalizarExpedicaoUseCase = require('../usecases/expedicao/finalizarExpedicao.usecase');
const resumoExpedicaoUseCase = require('../usecases/expedicao/resumoExpedicao.usecase');
const adicionarEventoExpedicaoUsecase = require('../usecases/expedicao/adicionarEventoExpedicao.usecase');

const iniciarExpedicao = async (req, res) => {
  const result = await iniciarExpedicaoUseCase.execute(req.body);
  return res.status(result.status).json(result.body);
};

const adicionarEventoExpedicao = async (req, res) => {
  const result = await adicionarEventoExpedicaoUsecase.execute({
    params: req.params,
    body: req.body
  });
  return res.status(result.status).json(result.body);
};


const scanSerie = async (req, res) => {
  const result = await scanSerieUseCase.execute({ params: req.params, body: req.body });
  return res.status(result.status).json(result.body);
};

const uploadFotoSerie = async (req, res) => {
  const result = await uploadFotoSerieUseCase.execute({ params: req.params, body: req.body });
  return res.status(result.status).json(result.body);
};

const finalizarExpedicao = async (req, res) => {
  const result = await finalizarExpedicaoUseCase.execute({ params: req.params, body: req.body });
  return res.status(result.status).json(result.body);
};

const resumoExpedicao = async (req, res) => {
  const result = await resumoExpedicaoUseCase.execute({ params: req.params });
  return res.status(result.status).json(result.body);
};

module.exports = {
  iniciarExpedicao,
  scanSerie,
  uploadFotoSerie,
  finalizarExpedicao,
  resumoExpedicao,
  adicionarEventoExpedicao
};
