const crypto = require('crypto');
const { prisma } = require('../../database/prisma');
const manutencaoRepo = require('../../repositories/manutencao.repository');
const manutencaoSerieRepo = require('../../repositories/manutencaoSerie.repository');
const {
  FLUXO_MANUTENCAO,
  STATUS_TERMINAIS_MANUTENCAO,
  podeAvancar,
  proximoStatus
} = require('../../domain/fluxoManutencao');
const { validarSetorDoFuncionarioAsync } = require('../../domain/setorManutencao');
const { formatDateTimeBr } = require('../../utils/dateBr');
const { viaOndaTemEtiqueta } = require('../../integrations/viaonda/viaonda.facade');

function montarResumoManutencao(manutencao) {
  const resumo = {
    id: manutencao.id,
    numeroOS: manutencao.numeroOS,
    status: manutencao.status,
    codProdutoOmie: manutencao.codProdutoOmie,
    dataEntrada: formatDateTimeBr(manutencao.dataEntrada, { withDash: true })
  };

  if (manutencao.emGarantia !== null && manutencao.emGarantia !== undefined) {
    resumo.emGarantia = manutencao.emGarantia;
  }
  if (manutencao.aprovadoOrcamento !== null && manutencao.aprovadoOrcamento !== undefined) {
    resumo.aprovadoOrcamento = manutencao.aprovadoOrcamento;
  }
  if (manutencao.diagnostico) resumo.diagnostico = manutencao.diagnostico;
  if (manutencao.dataAprovacao) {
    resumo.dataAprovacao = formatDateTimeBr(manutencao.dataAprovacao, { withDash: true });
  }
  if (manutencao.dataFinalizacao) {
    resumo.dataFinalizacao = formatDateTimeBr(manutencao.dataFinalizacao, { withDash: true });
  }

  return resumo;
}

async function execute({ params, body }) {
  const { id } = params;
  const { status, funcionarioId, observacao, emGarantia, aprovadoOrcamento, diagnostico } = body;

  if (!id || !status || !funcionarioId) {
    return { status: 400, body: { erro: 'id, status e funcionarioId são obrigatórios' } };
  }

  const manutencao = await manutencaoRepo.findById(String(id));
  if (!manutencao) return { status: 404, body: { erro: 'Manutenção não encontrada' } };

  if (STATUS_TERMINAIS_MANUTENCAO.includes(manutencao.status)) {
    return { status: 400, body: { erro: `Manutenção já está encerrada em '${manutencao.status}'` } };
  }

  const exigeSerie = manutencao.codProdutoOmie
    ? await viaOndaTemEtiqueta(manutencao.codProdutoOmie, manutencao.empresa)
    : false;
  const totalSeries = (await manutencaoSerieRepo.findByManutencaoId(String(id))).length;
  if (exigeSerie === true && totalSeries === 0) {
    return {
      status: 400,
      body: {
        erro: 'Produto desta Manutenção exige série. Escaneie a série antes de avançar etapa.',
        codProdutoOmie: manutencao.codProdutoOmie,
        statusAtual: manutencao.status,
        dica: "Use POST /manutencao/:id/scan-serie com { serieProduto, funcionarioId }"
      }
    };
  }

  const proxRaw = String(status).trim();
  const prox = proxRaw === 'devolucao' ? 'devolvida' : proxRaw;
  const isFluxo = FLUXO_MANUTENCAO.includes(prox);
  if (!isFluxo) {
    return { status: 400, body: { erro: 'Status de Manutenção inválido' } };
  }

  const validacaoSetor = await validarSetorDoFuncionarioAsync(funcionarioId, prox);
  if (!validacaoSetor.ok) {
    console.info('[manutencao.avancar] bloqueado_setor', {
      manutencaoId: String(id),
      funcionarioId: String(funcionarioId).trim(),
      statusAtual: manutencao.status,
      statusDestino: prox,
      setorEsperado: validacaoSetor.esperado || null,
      setorRecebido: validacaoSetor.recebido || null
    });
    return {
      status: 403,
      body: validacaoSetor.erro
        ? { erro: validacaoSetor.erro }
        : {
            erro: `A etapa '${prox}' só pode ser executada pelo setor '${validacaoSetor.esperado}'`,
            setorRecebido: validacaoSetor.recebido
          }
    };
  }

  const permitido = podeAvancar(manutencao.status, prox);
  if (!permitido) {
    const esperado = proximoStatus(manutencao.status);
    return {
      status: 400,
      body: {
        erro: `Transição inválida: '${manutencao.status}' -> '${prox}'`,
        statusAtual: manutencao.status,
        proximoStatusEsperado: esperado,
        dica: esperado
          ? `Use primeiro status='${esperado}' em /manutencao/:id/avancar`
          : 'Manutenção em etapa terminal. não há próximo status no fluxo.'
      }
    };
  }

  if (prox === 'avaliacao_garantia' && emGarantia === undefined) {
    return {
      status: 400,
      body: { erro: 'Informe emGarantia (true/false) na etapa avaliacao_garantia' }
    };
  }

  if (prox !== 'avaliacao_garantia' && emGarantia !== undefined) {
    return {
      status: 400,
      body: { erro: 'emGarantia so pode ser informado na etapa avaliacao_garantia' }
    };
  }

  const emGarantiaResolvido = emGarantia === undefined ? manutencao.emGarantia : Boolean(emGarantia);
  const aprovadoResolvido =
    aprovadoOrcamento === undefined ? manutencao.aprovadoOrcamento : Boolean(aprovadoOrcamento);

  if (
    manutencao.status === 'aguardando_aprovacao' &&
    emGarantiaResolvido === false &&
    aprovadoResolvido === false &&
    !['devolvida', 'descarte'].includes(prox)
  ) {
    return {
      status: 400,
      body: { erro: "Quando o cliente não aprova, avance para 'devolvida' ou 'descarte'." }
    };
  }

  if (prox === 'reparo' && emGarantiaResolvido === false && aprovadoResolvido !== true) {
    return {
      status: 400,
      body: { erro: 'Para Manutenção fora de garantia, aprovadoOrcamento=true é obrigatório antes do reparo' }
    };
  }

  if (
    (prox === 'devolvida' || prox === 'descarte') &&
    !(emGarantiaResolvido === false && aprovadoResolvido === false)
  ) {
    return {
      status: 400,
      body: {
        erro: `'${prox}' só é permitido para Manutenção fora de garantia e sem aprovação de orçamento.`
      }
    };
  }

  if (prox === 'finalizada') {
    return {
      status: 400,
      body: { erro: "Use o endpoint '/manutencao/:id/finalizar' para concluir a Manutenção" }
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
            prox === 'reparo' && aprovadoResolvido === true ? new Date() : manutencao.dataAprovacao
        }
      });

      if (claimed.count === 0) return null;

      await tx.manutencaoEvento.create({
        data: {
          id: crypto.randomUUID(),
          manutencaoId: String(id),
          tipo: `status_${prox}`,
          funcionarioId: String(funcionarioId).trim(),
          setor: validacaoSetor.setor,
          observacao: observacao ? String(observacao) : null
        }
      });

      return tx.manutencao.findUnique({ where: { id: String(id) } });
    });

    if (!atualizado) {
      return {
        status: 409,
        body: {
          erro: 'Conflito de concorrência: Manutenção foi alterada por outro usuário. Atualize e tente novamente.',
          code: 'CONCURRENCY_CONFLICT',
          detalhe: { recurso: 'Manutencao', manutencaoId: String(id) }
        }
      };
    }

    console.info('[manutencao.avancar] sucesso', {
      manutencaoId: String(id),
      funcionarioId: String(funcionarioId).trim(),
      setor: validacaoSetor.setor,
      statusAnterior,
      statusNovo: atualizado.status
    });

    return {
      status: 200,
      body: {
        ok: true,
        mensagem: `Manutenção avançou de '${statusAnterior}' para '${atualizado.status}'`,
        manutencao: montarResumoManutencao(atualizado)
      }
    };
  } catch (err) {
    console.error('Erro avancarEtapaManutencao:', err);
    return { status: 500, body: { erro: 'Erro interno ao avançar etapa da Manutenção' } };
  }
}

module.exports = { execute };
