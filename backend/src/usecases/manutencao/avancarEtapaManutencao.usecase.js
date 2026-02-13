const crypto = require('crypto');
const { prisma } = require('../../database/prisma');
const manutencaoRepo = require('../../repositories/manutencao.repository');
const {
  FLUXO_MANUTENCAO,
  STATUS_TERMINAIS_MANUTENCAO,
  podeAvancar,
  proximoStatus
} = require('../../domain/fluxoManutencao');
const { formatDateTimeBr } = require('../../utils/dateBr');

function montarResumoManutencao(manutencao) {
  return {
    id: manutencao.id,
    numeroOS: manutencao.numeroOS,
    empresa: manutencao.empresa,
    status: manutencao.status,
    funcionarioAtualId: manutencao.funcionarioAtualId,
    serieProduto: manutencao.serieProduto,
    codProdutoOmie: manutencao.codProdutoOmie,
    clienteNome: manutencao.clienteNome,
    defeitoRelatado: manutencao.defeitoRelatado,
    diagnostico: manutencao.diagnostico,
    emGarantia: manutencao.emGarantia,
    aprovadoOrcamento: manutencao.aprovadoOrcamento,
    dataEntrada: formatDateTimeBr(manutencao.dataEntrada, { withDash: true }),
    dataAprovacao: formatDateTimeBr(manutencao.dataAprovacao, { withDash: true }),
    dataFinalizacao: formatDateTimeBr(manutencao.dataFinalizacao, { withDash: true })
  };
}

async function execute({ params, body }) {
  const { id } = params;
  const {
    status,
    funcionarioId,
    observacao,
    emGarantia,
    aprovadoOrcamento,
    diagnostico
  } = body;

  if (!id || !status || !funcionarioId) {
    return { status: 400, body: { erro: 'id, status e funcionarioId sao obrigatorios' } };
  }

  const manutencao = await manutencaoRepo.findById(String(id));
  if (!manutencao) return { status: 404, body: { erro: 'Manutencao nao encontrada' } };

  if (STATUS_TERMINAIS_MANUTENCAO.includes(manutencao.status)) {
    return { status: 400, body: { erro: `Manutencao ja esta encerrada em '${manutencao.status}'` } };
  }

  const prox = String(status).trim();
  const isTerminal = STATUS_TERMINAIS_MANUTENCAO.includes(prox);
  const isFluxo = FLUXO_MANUTENCAO.includes(prox);

  if (!isTerminal && !isFluxo) {
    return { status: 400, body: { erro: 'Status de manutencao invalido' } };
  }

  const permitido = isTerminal || podeAvancar(manutencao.status, prox);
  if (!permitido) {
    const esperado = proximoStatus(manutencao.status);
    return {
      status: 400,
      body: {
        erro: `Transicao invalida: '${manutencao.status}' -> '${prox}'`,
        statusAtual: manutencao.status,
        proximoStatusEsperado: esperado,
        dica: esperado
          ? `Use primeiro status='${esperado}' em /manutencao/:id/avancar`
          : 'Manutencao em etapa terminal. Nao ha proximo status no fluxo.'
      }
    };
  }

  // obrigatorio definir garantia ao sair da avaliacao
  if (manutencao.status === 'avaliacao_garantia' && emGarantia === undefined) {
    return {
      status: 400,
      body: { erro: 'Informe emGarantia (true/false) para avancar apos avaliacao_garantia' }
    };
  }

  const emGarantiaResolvido =
    emGarantia === undefined ? manutencao.emGarantia : Boolean(emGarantia);
  const aprovadoResolvido =
    aprovadoOrcamento === undefined ? manutencao.aprovadoOrcamento : Boolean(aprovadoOrcamento);

  // sem garantia, so pode entrar em reparo se orcamento estiver aprovado
  if (prox === 'reparo' && emGarantiaResolvido === false && aprovadoResolvido !== true) {
    return {
      status: 400,
      body: {
        erro: 'Para manutencao fora de garantia, aprovadoOrcamento=true e obrigatorio antes do reparo'
      }
    };
  }

  if (prox === 'finalizada') {
    return {
      status: 400,
      body: { erro: "Use o endpoint '/manutencao/:id/finalizar' para concluir a manutencao" }
    };
  }

  try {
    const statusAnterior = manutencao.status;
    const atualizado = await prisma.$transaction(async (tx) => {
      const claimed = await tx.manutencao.updateMany({
        where: { id: String(id), version: manutencao.version, status: manutencao.status },
        data: {
          status: prox,
          version: { increment: 1 },
          funcionarioAtualId: String(funcionarioId).trim(),
          emGarantia: emGarantiaResolvido,
          aprovadoOrcamento: aprovadoResolvido,
          diagnostico: diagnostico === undefined ? manutencao.diagnostico : String(diagnostico || ''),
          dataAprovacao:
            prox === 'reparo' && aprovadoResolvido === true ? new Date() : manutencao.dataAprovacao,
          dataFinalizacao: prox === 'finalizada' ? new Date() : manutencao.dataFinalizacao
        }
      });

      if (claimed.count === 0) {
        return null;
      }

      await tx.manutencaoEvento.create({
        data: {
          id: crypto.randomUUID(),
          manutencaoId: String(id),
          tipo: `status_${prox}`,
          funcionarioId: String(funcionarioId).trim(),
          observacao: observacao ? String(observacao) : null
        }
      });

      return tx.manutencao.findUnique({ where: { id: String(id) } });
    });

    if (!atualizado) {
      return {
        status: 409,
      body: {
        erro: 'Conflito de concorrencia: manutencao foi alterada por outro usuario. Atualize e tente novamente.',
        code: 'CONCURRENCY_CONFLICT',
          detalhe: { recurso: 'Manutencao', manutencaoId: String(id) }
        }
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        mensagem: `Manutencao avancou de '${statusAnterior}' para '${atualizado.status}'`,
        manutencao: montarResumoManutencao(atualizado)
      }
    };
  } catch (err) {
    console.error('Erro avancarEtapaManutencao:', err);
    return { status: 500, body: { erro: 'Erro interno ao avancar etapa da manutencao' } };
  }
}

module.exports = { execute };
