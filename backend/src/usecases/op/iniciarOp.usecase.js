const crypto = require('crypto');
const ordemRepo = require('../../repositories/ordemProducao.repository');
const eventoRepo = require('../../repositories/eventoOP.repository');
const { buscarOpNaAPI } = require('../../integrations/viaonda/viaonda.op');
const { consultarProdutoNoOmie } = require('../../integrations/omie/omie.produto');
const {
  consultarEstruturaProduto,
  extrairDescrFamiliaIdent
} = require('../../integrations/omie/omie.estrutura');
const { conflictResponse } = require('../../utils/httpErrors');
const { validarFuncionarioAtivoNoSetor, SETOR_PRODUCAO } = require('../../domain/setorManutencao');

function detectarTipoOp({ codigoProduto, descricaoProduto, familiaIdent }) {
  const familia = String(familiaIdent || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  // Regra oficial: familia "SubProduto" no ident da malha passa por teste.
  if (familia === 'subproduto') return 'subproduto_com_teste';

  // Fallback: codigos de placa continuam no fluxo sem teste.
  const codigo = String(codigoProduto || '').toUpperCase();
  const descricao = String(descricaoProduto || '').toUpperCase();
  if (codigo.includes('PCB_MONT')) return 'subproduto_sem_teste';
  if (descricao.includes('PLACA') && descricao.includes('MONT')) return 'subproduto_sem_teste';

  return 'produto_final';
}

function normalizarTipoOpBanco(tipoOpRaw) {
  const v = String(tipoOpRaw || '').trim();
  if (v === 'subproduto') return 'subproduto_sem_teste';
  return v || 'produto_final';
}

function detectarTipoOpFallback({ codigoProduto, descricaoProduto, familiaOmie }) {
  const familia = String(familiaOmie || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (familia === 'subproduto') return 'subproduto_com_teste';

  const codigo = String(codigoProduto || '').toUpperCase();
  const descricao = String(descricaoProduto || '').toUpperCase();
  if (codigo.includes('PCB_MONT')) return 'subproduto_sem_teste';
  if (descricao.includes('PLACA') && descricao.includes('MONT')) return 'subproduto_sem_teste';

  return 'produto_final';
}

async function execute(body) {
  const { numeroOP, empresa, funcionarioId } = body;

  if (!numeroOP || !empresa || !funcionarioId) {
    return {
      status: 400,
      body: { erro: 'numeroOP, empresa e funcionarioId são obrigatórios' }
    };
  }

  const numero = String(numeroOP).trim();
  const emp = String(empresa).trim();
  const funcionario = String(funcionarioId).trim();
  const checkFuncionario = await validarFuncionarioAtivoNoSetor(funcionario, SETOR_PRODUCAO);
  if (!checkFuncionario.ok) return { status: 403, body: { erro: checkFuncionario.erro } };

  let externa;
  try {
    externa = await buscarOpNaAPI(numero, emp);
  } catch (err) {
    return { status: 400, body: { erro: err.message } };
  }

  if (!externa) {
    return { status: 404, body: { erro: 'OP não existe na API externa' } };
  }

  const codigoProduto = externa?.codigo ? String(externa.codigo).trim() : '';
  let tipoOpDetectado = 'produto_final';
  if (codigoProduto) {
    try {
      const produtoOmie = await consultarProdutoNoOmie(codigoProduto, emp);
      const estrutura = await consultarEstruturaProduto(codigoProduto, emp).catch(() => null);
      const familiaIdent = extrairDescrFamiliaIdent(estrutura);

      tipoOpDetectado = detectarTipoOp({
        codigoProduto,
        descricaoProduto: externa?.descricao_produto || '',
        familiaIdent
      });

      // Se não veio família no ident, mantém compatibilidade com fallback anterior.
      if (!familiaIdent) {
        tipoOpDetectado = detectarTipoOpFallback({
          codigoProduto,
          descricaoProduto: externa?.descricao_produto || '',
          familiaOmie: produtoOmie?.familia || ''
        });
      }
    } catch (_err) {
      tipoOpDetectado = detectarTipoOpFallback({
        codigoProduto,
        descricaoProduto: externa?.descricao_produto || '',
        familiaOmie: ''
      });
    }
  }

  let op = await ordemRepo.findByNumeroOP(numero);

  if (!op) {
    try {
      op = await ordemRepo.create({
        id: crypto.randomUUID(),
        numeroOP: numero,
        descricaoProduto: externa.descricao_produto || '',
        quantidadeProduzida: Number(externa.quantidade_total || 0) || 0,
        tipoOp: tipoOpDetectado,
        status: 'montagem',
        empresa: emp
      });
    } catch (err) {
      if (err?.code === 'P2002') {
        op = await ordemRepo.findByNumeroOP(numero);
        if (!op) {
          return conflictResponse('Conflito de concorrência ao iniciar OP. Tente novamente.', {
            recurso: 'OrdemProducao',
            numeroOP: numero
          });
        }
      } else {
        throw err;
      }
    }
  }

  if (op.empresa !== emp) {
    return {
      status: 400,
      body: { erro: `OP já pertence à empresa '${op.empresa}'. Você enviou '${emp}'.`, op }
    };
  }

  if (!op.tipoOp || op.tipoOp === 'subproduto') {
    op = await ordemRepo.updateById(String(op.id), { tipoOp: tipoOpDetectado });
  } else {
    op = { ...op, tipoOp: normalizarTipoOpBanco(op.tipoOp) };
  }

  if (op.status !== 'montagem') {
    return {
      status: 400,
      body: { erro: `OP já está em '${op.status}'. Não é possível iniciar montagem novamente.`, op }
    };
  }

  const ultimoEventoMontagem = await eventoRepo.findUltimoEvento(op.id, 'montagem');
  const precisaReiniciarMontagem =
    !ultimoEventoMontagem || ['pausa', 'fim'].includes(ultimoEventoMontagem.tipo);

  if (precisaReiniciarMontagem) {
    await eventoRepo.create({
      id: crypto.randomUUID(),
      opId: op.id,
      tipo: 'inicio',
      etapa: 'montagem',
      funcionarioId: funcionario
    });
  }

  return {
    status: 200,
    body: {
      ok: true,
      op: {
        ...op,
        codigoProduto: externa?.codigo ? String(externa.codigo).trim() : null
      }
    }
  };
}

module.exports = { execute };
