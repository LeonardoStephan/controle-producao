const abrirManutencaoUseCase = require('../usecases/manutencao/abrirManutencao.usecase');
const avancarEtapaManutencaoUseCase = require('../usecases/manutencao/avancarEtapaManutencao.usecase');
const registrarPecaTrocadaUseCase = require('../usecases/manutencao/registrarPecaTrocadaManutencao.usecase');
const scanSerieManutencaoUseCase = require('../usecases/manutencao/scanSerieManutencao.usecase');
const finalizarManutencaoUseCase = require('../usecases/manutencao/finalizarManutencao.usecase');
const resumoManutencaoUseCase = require('../usecases/manutencao/resumoManutencao.usecase');

const abrirManutencao = async (req, res) => {
  const result = await abrirManutencaoUseCase.execute(req.body);
  return res.status(result.status).json(result.body);
};

const avancarEtapaManutencao = async (req, res) => {
  const result = await avancarEtapaManutencaoUseCase.execute({ params: req.params, body: req.body });
  return res.status(result.status).json(result.body);
};

const registrarPecaTrocada = async (req, res) => {
  const result = await registrarPecaTrocadaUseCase.execute({ params: req.params, body: req.body });
  return res.status(result.status).json(result.body);
};

const scanSerieManutencao = async (req, res) => {
  const result = await scanSerieManutencaoUseCase.execute({ params: req.params, body: req.body });
  return res.status(result.status).json(result.body);
};

const finalizarManutencao = async (req, res) => {
  const result = await finalizarManutencaoUseCase.execute({ params: req.params, body: req.body });
  return res.status(result.status).json(result.body);
};

const resumoManutencao = async (req, res) => {
  const result = await resumoManutencaoUseCase.execute({ params: req.params });
  return res.status(result.status).json(result.body);
};

module.exports = {
  abrirManutencao,
  avancarEtapaManutencao,
  registrarPecaTrocada,
  scanSerieManutencao,
  finalizarManutencao,
  resumoManutencao
};
