const crypto = require('crypto');
const funcionarioRepo = require('../../../repositories/funcionario.repository');
const { normalizarListaSetores } = require('../../../domain/setorManutencao');

async function execute(body) {
  const { cracha, nome, setores, ativo = true } = body || {};

  if (!cracha || !nome || !setores) {
    return { status: 400, body: { erro: 'cracha, nome e setores são obrigatórios' } };
  }

  const crachaTxt = String(cracha).trim();
  const nomeTxt = String(nome).trim();
  const setoresList = normalizarListaSetores(setores);
  if (!setoresList.length) {
    return { status: 400, body: { erro: 'setores inválidos. Ex.: ["manutencao","financeiro"]' } };
  }

  const existente = await funcionarioRepo.findByCracha(crachaTxt);
  if (existente) {
    return { status: 400, body: { erro: `cracha ${crachaTxt} já cadastrado` } };
  }

  const criado = await funcionarioRepo.create({
    id: crypto.randomUUID(),
    cracha: crachaTxt,
    nome: nomeTxt,
    setores: setoresList.join(','),
    ativo: Boolean(ativo)
  });

  return {
    status: 200,
    body: {
      ok: true,
      funcionario: {
        id: criado.id,
        cracha: criado.cracha,
        nome: criado.nome,
        setores: setoresList,
        ativo: criado.ativo
      }
    }
  };
}

module.exports = { execute };

