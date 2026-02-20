const crypto = require('crypto');
const { prisma } = require('../../database/prisma');

const ordemRepo = require('../../repositories/ordemProducao.repository');
const eventoRepo = require('../../repositories/eventoOP.repository');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');
const subprodutoRepo = require('../../repositories/subproduto.repository');
const consumoPecaRepo = require('../../repositories/consumoPeca.repository');
const manutencaoPecaRepo = require('../../repositories/manutencaoPecaTrocada.repository');

const { extrairCodigoDaPecaDoQr, extrairQrId } = require('../../utils/pecaQr');
const { estruturaTemItem } = require('../../integrations/omie/omie.estrutura');
const { conflictResponse } = require('../../utils/httpErrors');
const { validarFuncionarioAtivoNoSetor, SETOR_PRODUCAO } = require('../../domain/setorManutencao');

async function execute(body) {
  const {
    codigoPeca,
    qrCode,
    funcionarioId,
    subprodutoId,
    serieProdFinalId,
    empresa,
    codProdutoOmie
  } = body;

  if (!codigoPeca || !qrCode || !funcionarioId || !empresa) {
    return { status: 400, body: { erro: 'Dados obrigatórios ausentes' } };
  }

  const checkFuncionario = await validarFuncionarioAtivoNoSetor(String(funcionarioId).trim(), SETOR_PRODUCAO);
  if (!checkFuncionario.ok) {
    return { status: 403, body: { erro: checkFuncionario.erro } };
  }

  if (!subprodutoId && !serieProdFinalId) {
    return { status: 400, body: { erro: 'Informe subprodutoId OU serieProdFinalId' } };
  }

  const codigoExtraido = extrairCodigoDaPecaDoQr(qrCode);
  if (!codigoExtraido) return { status: 400, body: { erro: 'QR inválido' } };
  const qrId = extrairQrId(qrCode);

  if (String(codigoExtraido).trim() !== String(codigoPeca).trim()) {
    return { status: 400, body: { erro: 'QR não corresponde ao código da peça' } };
  }

  try {
    let opIdResolved = null;

    let contextoSubprodutoId = null;
    let contextoserieProdFinalId = null;

    let codProdutoOmieResolved = null; // BOM do PF
    let codProdutoOmiePlaca = null; // BOM da placa (codigoSubproduto)

    // =========================
    // Contexto por ProdutoFinal
    // =========================
    if (serieProdFinalId) {
      const pf = await produtoFinalRepo.findByIdSelect(serieProdFinalId, {
        id: true,
        opId: true,
        codProdutoOmie: true
      });

      if (!pf) return { status: 404, body: { erro: 'Produto final não encontrado' } };

      opIdResolved = pf.opId;
      contextoserieProdFinalId = pf.id;
      codProdutoOmieResolved = pf.codProdutoOmie || null;

      if (!codProdutoOmieResolved && codProdutoOmie) {
        codProdutoOmieResolved = String(codProdutoOmie).trim();
      }
    }

    // =========================
    // Contexto por Subproduto (placa)
    // =========================
    if (subprodutoId) {
      const sp = await subprodutoRepo.findById(subprodutoId);
      if (!sp) return { status: 404, body: { erro: 'Subproduto não encontrado' } };

      contextoSubprodutoId = sp.id;
      codProdutoOmiePlaca = sp.codigoSubproduto ? String(sp.codigoSubproduto).trim() : null;

      // se a placa estiver vinculada a um produto final,
      // a trava de etapa precisa ser a OP do PF (mesmo se OP da placa estiver finalizada)
      if (sp.serieProdFinalId) {
        const pf = await produtoFinalRepo.findByIdSelect(sp.serieProdFinalId, {
          id: true,
          opId: true,
          codProdutoOmie: true
        });

        if (!pf) {
          return { status: 400, body: { erro: 'Subproduto vinculado a um ProdutoFinal inexistente' } };
        }

        opIdResolved = pf.opId;
        contextoserieProdFinalId = pf.id;

        codProdutoOmieResolved = pf.codProdutoOmie || null;
        if (!codProdutoOmieResolved && codProdutoOmie) {
          codProdutoOmieResolved = String(codProdutoOmie).trim();
        }
      } else {
        // placa não vinculada a PF -> comportamento antigo
        opIdResolved = sp.opId;
        contextoserieProdFinalId = null;

        if (codProdutoOmie) codProdutoOmieResolved = String(codProdutoOmie).trim();
      }
    }

    if (!opIdResolved) {
      return { status: 400, body: { erro: 'Não foi possível determinar a OP do contexto informado' } };
    }

    const op = await ordemRepo.findById(opIdResolved);
    if (!op) return { status: 404, body: { erro: 'OP não encontrada' } };

    if (String(op.empresa || '').trim() && String(empresa).trim() !== String(op.empresa).trim()) {
      return {
        status: 400,
        body: { erro: `OP pertence a empresa '${op.empresa}'. Voce enviou '${String(empresa).trim()}'.` }
      };
    }

    // consumo so se o processo "controlador" estiver em montagem
    if (op.status !== 'montagem') {
      return {
        status: 400,
        body: { erro: 'Consumo permitido apenas na montagem (da OP do produto final quando houver vínculo).' }
      };
    }

    const ultimoEvento = await eventoRepo.findUltimoEvento(opIdResolved, 'montagem');
    if (!ultimoEvento || ['pausa', 'fim'].includes(ultimoEvento.tipo)) {
      return { status: 400, body: { erro: 'Montagem não está ativa' } };
    }

    const qrAtivo = await consumoPecaRepo.findQrAtivo(qrCode);
    if (qrAtivo) return { status: 400, body: { erro: 'QR já utilizado' } };
    const qrAtivoManutencao = await manutencaoPecaRepo.findQrAtivo(qrCode);
    if (qrAtivoManutencao) return { status: 400, body: { erro: 'QR já utilizado na manutenção' } };
    if (qrId) {
      const qrIdExistente = await consumoPecaRepo.findQrIdAny(qrId);
      if (qrIdExistente) return { status: 400, body: { erro: 'ID de QR já utilizado' } };
      const qrIdExistenteManutencao = await manutencaoPecaRepo.findQrIdAny(qrId);
      if (qrIdExistenteManutencao) return { status: 400, body: { erro: 'ID de QR já utilizado na manutenção' } };
    }

    // =========================
    // Validação BOM "inteligente"
    // =========================
    let valido = false;

    // 1) tenta BOM do PF (se existir)
    if (codProdutoOmieResolved) {
      valido = await estruturaTemItem(codProdutoOmieResolved, empresa, codigoPeca);
    }

    // 2) se não bateu, tenta BOM da placa informada (se existir)
    if (!valido && codProdutoOmiePlaca) {
      valido = await estruturaTemItem(codProdutoOmiePlaca, empresa, codigoPeca);
    }

    // 3) se ainda não bateu e o usuário chamou por PF (sem subprodutoId),
    // tenta descobrir automaticamente qual placa vinculada contém essa peca no BOM
    if (!valido && serieProdFinalId && !subprodutoId) {
      const placas = await prisma.subproduto.findMany({
        where: { serieProdFinalId: String(serieProdFinalId) },
        select: { id: true, etiquetaId: true, codigoSubproduto: true }
      });

      const matches = [];
      for (const p of placas) {
        const codPlaca = String(p.codigoSubproduto || '').trim();
        if (!codPlaca) continue;

        const okNaPlaca = await estruturaTemItem(codPlaca, empresa, codigoPeca);
        if (okNaPlaca) {
          matches.push({ subprodutoId: p.id, etiquetaId: p.etiquetaId, codigoSubproduto: codPlaca });
        }
      }

      if (matches.length === 1) {
        contextoSubprodutoId = matches[0].subprodutoId;
        codProdutoOmiePlaca = matches[0].codigoSubproduto;
        valido = true;
      } else if (matches.length === 0) {
        return {
          status: 400,
          body: {
            erro: 'Peça não pertence ao BOM do produto final nem ao BOM de nenhuma placa vinculada a este produto final.',
          }
        };
      } else {
        return {
          status: 400,
          body: {
            erro: 'Peça encontrada no BOM de mais de uma placa. Informe o subprodutoId da placa correta.',
            candidatos: matches
          }
        };
      }
    }

    if (!valido) {
      return { status: 400, body: { erro: 'Peça não pertence ao BOM do produto nem da placa' } };
    }

    const consumosAtivosMesmoContexto = await consumoPecaRepo.findAtivosPorContexto({
      codigoPeca: String(codigoPeca),
      subprodutoId: contextoSubprodutoId,
      serieProdFinalId: contextoserieProdFinalId
    });

    const consumo = await prisma.$transaction(async (tx) => {
      for (const ativo of consumosAtivosMesmoContexto) {
        await consumoPecaRepo.update(tx, ativo.id, { fimEm: new Date() });
      }

      return consumoPecaRepo.create(tx, {
        id: crypto.randomUUID(),
        opId: opIdResolved,
        codigoPeca: String(codigoPeca),
        qrCode: String(qrCode),
        qrId: qrId ? String(qrId) : null,
        funcionarioId: String(funcionarioId),
        subprodutoId: contextoSubprodutoId,
        serieProdFinalId: contextoserieProdFinalId
      });
    });

    const consumoRetorno = {
      id: consumo.id,
      opId: consumo.opId,
      numeroOP: op?.numeroOP || null,
      codigoPeca: consumo.codigoPeca,
      qrCode: consumo.qrCode,
      qrId: consumo.qrId,
      subprodutoId: consumo.subprodutoId,
      serieProdFinalId: consumo.serieProdFinalId
    };

    return {
      status: 200,
      body: {
        ok: true,
        consumo: consumoRetorno,
        substituicaoAutomatica: consumosAtivosMesmoContexto.length > 0,
        consumosAnterioresEncerradosIds: consumosAtivosMesmoContexto.map((c) => c.id)
      }
    };
  } catch (err) {
    if (err?.code === 'P2002') {
      return {
        status: 409,
        body: {
          erro: 'QR Code ou ID de QR já utilizado para esta peça/contexto.',
          code: 'QR_DUPLICADO',
          detalhe: {
            recurso: 'ConsumoPeca',
            codigoPeca: String(body?.codigoPeca || ''),
            qrId: extrairQrId(String(body?.qrCode || '')) || null
          },
          dica: 'Use um QR novo para substituir a peca ou verifique se esta leitura já foi registrada.'
        }
      };
    }
    console.error(err);
    return { status: 500, body: { erro: 'Erro interno ao consumir peça' } };
  }
}

module.exports = { execute };

