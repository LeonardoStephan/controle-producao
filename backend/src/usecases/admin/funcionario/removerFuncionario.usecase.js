const funcionarioRepo = require('../../../repositories/funcionario.repository');

async function execute({ params }) {
  const { id } = params || {};
  if (!id) return { status: 400, body: { erro: 'id é obrigatório' } };

  const atual = await funcionarioRepo.findById(id);
  if (!atual) return { status: 404, body: { erro: 'funcionário não encontrado' } };

  await funcionarioRepo.remove(id);
  return { status: 200, body: { ok: true } };
}

module.exports = { execute };

