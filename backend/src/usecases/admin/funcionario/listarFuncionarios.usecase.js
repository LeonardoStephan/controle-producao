const funcionarioRepo = require('../../../repositories/funcionario.repository');
const { normalizarListaSetores } = require('../../../domain/setorManutencao');

async function execute() {
  const rows = await funcionarioRepo.list();
  return {
    status: 200,
    body: {
      ok: true,
      total: rows.length,
      funcionarios: rows.map((f) => ({
        id: f.id,
        cracha: f.cracha,
        nome: f.nome,
        setores: normalizarListaSetores(f.setores),
        ativo: f.ativo,
        criadoEm: f.criadoEm,
        atualizadoEm: f.atualizadoEm
      }))
    }
  };
}

module.exports = { execute };

