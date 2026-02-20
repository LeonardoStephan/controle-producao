const funcionarioRepo = require('../../../repositories/funcionario.repository');
const { normalizarListaSetores } = require('../../../domain/setorManutencao');

async function execute({ params, body }) {
  const { id } = params || {};
  const { cracha, nome, setores, ativo } = body || {};

  if (!id) return { status: 400, body: { erro: 'id é obrigatório' } };

  const atual = await funcionarioRepo.findById(id);
  if (!atual) return { status: 404, body: { erro: 'funcionário não encontrado' } };

  const data = {};
  if (cracha !== undefined) data.cracha = String(cracha).trim();
  if (nome !== undefined) data.nome = String(nome).trim();
  if (setores !== undefined) {
    const setoresList = normalizarListaSetores(setores);
    if (!setoresList.length) {
      return { status: 400, body: { erro: 'setores inválidos. Ex.: ["manutencao","financeiro"]' } };
    }
    data.setores = setoresList.join(',');
  }
  if (ativo !== undefined) data.ativo = Boolean(ativo);

  if (!Object.keys(data).length) {
    return { status: 400, body: { erro: 'nenhum campo para atualizar' } };
  }

  if (data.cracha && data.cracha !== atual.cracha) {
    const outro = await funcionarioRepo.findByCracha(data.cracha);
    if (outro) return { status: 400, body: { erro: `cracha ${data.cracha} já cadastrado` } };
  }

  const atualizado = await funcionarioRepo.update(id, data);
  return {
    status: 200,
    body: {
      ok: true,
      funcionario: {
        id: atualizado.id,
        cracha: atualizado.cracha,
        nome: atualizado.nome,
        setores: normalizarListaSetores(atualizado.setores),
        ativo: atualizado.ativo
      }
    }
  };
}

module.exports = { execute };

