const abrirManutencaoUseCase = require('../usecases/manutencao/abrirManutencao.usecase');
const avancarEtapaManutencaoUseCase = require('../usecases/manutencao/avancarEtapaManutencao.usecase');
const registrarPecaTrocadaUseCase = require('../usecases/manutencao/registrarPecaTrocadaManutencao.usecase');
const finalizarManutencaoUseCase = require('../usecases/manutencao/finalizarManutencao.usecase');
const resumoManutencaoUseCase = require('../usecases/manutencao/resumoManutencao.usecase');
const historicoPorSerieUseCase = require('../usecases/manutencao/historicoManutencaoPorSerie.usecase');

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

const finalizarManutencao = async (req, res) => {
  const result = await finalizarManutencaoUseCase.execute({ params: req.params, body: req.body });
  return res.status(result.status).json(result.body);
};

const resumoManutencao = async (req, res) => {
  const result = await resumoManutencaoUseCase.execute({ params: req.params });
  return res.status(result.status).json(result.body);
};

const historicoPorSerie = async (req, res) => {
  const result = await historicoPorSerieUseCase.execute({ params: req.params });
  return res.status(result.status).json(result.body);
};

module.exports = {
  abrirManutencao,
  avancarEtapaManutencao,
  registrarPecaTrocada,
  finalizarManutencao,
  resumoManutencao,
  historicoPorSerie
};
