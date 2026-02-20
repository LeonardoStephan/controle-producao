const funcionarioRepo = require('../../../repositories/funcionario.repository');

async function execute({ params, body }) {
  const { id } = params || {};
  const { ativo } = body || {};

  if (!id) return { status: 400, body: { erro: 'id é obrigatório' } };
  if (ativo === undefined) return { status: 400, body: { erro: 'ativo é obrigatório (true/false)' } };

  const atual = await funcionarioRepo.findById(id);
  if (!atual) return { status: 404, body: { erro: 'funcionário não encontrado' } };

  const atualizado = await funcionarioRepo.update(id, { ativo: Boolean(ativo) });
  return {
    status: 200,
    body: {
      ok: true,
      funcionario: {
        id: atualizado.id,
        cracha: atualizado.cracha,
        ativo: atualizado.ativo
      }
    }
  };
}

module.exports = { execute };

