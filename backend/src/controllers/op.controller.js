const iniciarOpUseCase = require('../usecases/op/iniciarOp.usecase');
const adicionarEventoUseCase = require('../usecases/op/adicionarEvento.usecase');
const finalizarEtapaUseCase = require('../usecases/op/finalizarEtapa.usecase');
const resumoOpUseCase = require('../usecases/op/resumoOp.usecase');
const rastreabilidadeMateriaisUseCase = require('../usecases/op/rastreabilidadeMateriais.usecase');

const iniciarOp = async (req, res) => {
  const result = await iniciarOpUseCase.execute(req.body);
  return res.status(result.status).json(result.body);
};

const adicionarEvento = async (req, res) => {
  const { id } = req.params;

  const result = await adicionarEventoUseCase.execute({
    id,
    ...req.body
  });

  return res.status(result.status).json(result.body);
};

const finalizarEtapa = async (req, res) => {
  const result = await finalizarEtapaUseCase.execute({ params: req.params, body: req.body });
  return res.status(result.status).json(result.body);
};

const resumoOp = async (req, res) => {
  const result = await resumoOpUseCase.execute({ params: req.params });
  return res.status(result.status).json(result.body);
};

const rastreabilidadeMateriais = async (req, res) => {
  const result = await rastreabilidadeMateriaisUseCase.execute({ params: req.params });
  return res.status(result.status).json(result.body);
};

module.exports = {
  iniciarOp,
  adicionarEvento,
  finalizarEtapa,
  resumoOp,
  rastreabilidadeMateriais
};
