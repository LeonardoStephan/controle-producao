const listarUseCase = require('../usecases/admin/funcionario/listarFuncionarios.usecase');
const criarUseCase = require('../usecases/admin/funcionario/criarFuncionario.usecase');
const atualizarUseCase = require('../usecases/admin/funcionario/atualizarFuncionario.usecase');
const alterarAtivoUseCase = require('../usecases/admin/funcionario/alterarAtivoFuncionario.usecase');
const removerUseCase = require('../usecases/admin/funcionario/removerFuncionario.usecase');

const listar = async (_req, res) => {
  const result = await listarUseCase.execute();
  return res.status(result.status).json(result.body);
};

const criar = async (req, res) => {
  const result = await criarUseCase.execute(req.body);
  return res.status(result.status).json(result.body);
};

const atualizar = async (req, res) => {
  const result = await atualizarUseCase.execute({ params: req.params, body: req.body });
  return res.status(result.status).json(result.body);
};

const alterarAtivo = async (req, res) => {
  const result = await alterarAtivoUseCase.execute({ params: req.params, body: req.body });
  return res.status(result.status).json(result.body);
};

const remover = async (req, res) => {
  const result = await removerUseCase.execute({ params: req.params });
  return res.status(result.status).json(result.body);
};

module.exports = {
  listar,
  criar,
  atualizar,
  alterarAtivo,
  remover
};

