const funcionarioRepo = require('../repositories/funcionario.repository');

const SETOR_FINANCEIRO = 'financeiro';
const SETOR_MANUTENCAO = 'manutencao';
const SETOR_PRODUCAO = 'producao';
const SETOR_EXPEDICAO = 'expedicao';

const SETOR_POR_STATUS = {
  conferencia_inicial: SETOR_FINANCEIRO,
  conferencia_manutencao: SETOR_MANUTENCAO,
  avaliacao_garantia: SETOR_MANUTENCAO,
  aguardando_aprovacao: SETOR_FINANCEIRO,
  reparo: SETOR_MANUTENCAO,
  devolvida: SETOR_FINANCEIRO,
  descarte: SETOR_FINANCEIRO,
  embalagem: SETOR_MANUTENCAO
};

function normalizarSetor(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizarListaSetores(valor) {
  if (Array.isArray(valor)) {
    return Array.from(
      new Set(
        valor
          .map((s) => normalizarSetor(s))
          .filter(Boolean)
      )
    );
  }

  return Array.from(
    new Set(
      String(valor || '')
        .split(',')
        .map((s) => normalizarSetor(s))
        .filter(Boolean)
    )
  );
}

function setorEsperadoParaStatus(statusDestino) {
  const s = String(statusDestino || '').trim();
  return SETOR_POR_STATUS[s] || null;
}

async function obterPerfilFuncionario(funcionarioId) {
  const cracha = String(funcionarioId || '').trim();
  if (!cracha) return null;

  const row = await funcionarioRepo.findByCracha(cracha);
  if (!row) return null;

  return {
    origem: 'db',
    id: row.id,
    cracha: row.cracha,
    nome: row.nome,
    ativo: Boolean(row.ativo),
    setores: normalizarListaSetores(row.setores)
  };
}

async function obterSetorPorFuncionarioAsync(funcionarioId) {
  const perfil = await obterPerfilFuncionario(funcionarioId);
  if (!perfil || !perfil.ativo) return null;
  return perfil.setores[0] || null;
}

async function validarFuncionarioAtivoNoSetor(funcionarioId, setorObrigatorio) {
  const perfil = await obterPerfilFuncionario(funcionarioId);
  if (!perfil) {
    return {
      ok: false,
      erro: 'Funcionário não encontrado. Cadastre o crachá em /admin/funcionarios.',
      perfil: null
    };
  }

  if (!perfil.ativo) {
    return {
      ok: false,
      erro: 'Funcionário inativo.',
      perfil
    };
  }

  const setorNorm = normalizarSetor(setorObrigatorio);
  if (!perfil.setores.includes(setorNorm)) {
    return {
      ok: false,
      erro: `Funcionário sem permissão para o setor '${setorNorm}'.`,
      perfil
    };
  }

  return { ok: true, perfil };
}

async function validarSetorDoFuncionarioAsync(funcionarioId, statusDestino) {
  const esperado = setorEsperadoParaStatus(statusDestino);
  if (!esperado) return { ok: true, setor: null, esperado: null, recebido: null };

  const perfil = await obterPerfilFuncionario(funcionarioId);
  if (!perfil) {
    return {
      ok: false,
      erro: 'Funcionário não encontrado. Cadastre o crachá em /admin/funcionarios.',
      setor: null,
      esperado,
      recebido: null
    };
  }

  if (!perfil.ativo) {
    return {
      ok: false,
      erro: 'Funcionário inativo.',
      setor: null,
      esperado,
      recebido: null
    };
  }

  const recebido = perfil.setores[0] || null;
  const ok = perfil.setores.includes(esperado);
  return {
    ok,
    erro: ok ? null : `A etapa '${statusDestino}' exige setor '${esperado}'.`,
    setor: recebido,
    esperado,
    recebido
  };
}

module.exports = {
  SETOR_FINANCEIRO,
  SETOR_MANUTENCAO,
  SETOR_PRODUCAO,
  SETOR_EXPEDICAO,
  normalizarSetor,
  normalizarListaSetores,
  obterPerfilFuncionario,
  obterSetorPorFuncionarioAsync,
  validarFuncionarioAtivoNoSetor,
  validarSetorDoFuncionarioAsync
};
