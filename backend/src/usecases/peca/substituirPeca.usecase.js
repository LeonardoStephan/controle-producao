const crypto = require('crypto');
const { prisma } = require('../../database/prisma');

const consumoPecaRepo = require('../../repositories/consumoPeca.repository');
const subprodutoRepo = require('../../repositories/subproduto.repository');
const { extrairCodigoDaPecaDoQr, extrairQrId } = require('../../utils/pecaQr');
const { validarFuncionarioAtivoNoSetor, SETOR_PRODUCAO } = require('../../domain/setorManutencao');

async function execute(body) {
  const { subprodutoEtiqueta, serieProdFinalId, codigoPeca, novoQrCode, funcionarioId } = body;

  if ((!subprodutoEtiqueta && !serieProdFinalId) || !codigoPeca || !novoQrCode || !funcionarioId) {
    return { status: 400, body: { erro: 'Dados obrigatórios ausentes' } };
  }

  const checkFuncionario = await validarFuncionarioAtivoNoSetor(String(funcionarioId).trim(), SETOR_PRODUCAO);
  if (!checkFuncionario.ok) {
    return { status: 403, body: { erro: checkFuncionario.erro } };
  }

  const codigoExtraidoNovo = extrairCodigoDaPecaDoQr(novoQrCode);
  if (!codigoExtraidoNovo) {
    return {
      status: 400,
      body: { erro: 'Novo QR Code inválido (não foi possível extrair o código da peça)' }
    };
  }

  if (String(codigoExtraidoNovo).trim() !== String(codigoPeca).trim()) {
    return { status: 400, body: { erro: 'QR novo não corresponde ao código da peça' } };
  }

  const novoQrId = extrairQrId(novoQrCode) || null;

  try {
    let subprodutoIdResolved = null;
    let serieProdFinalIdResolved = null;

    if (subprodutoEtiqueta) {
      const sp = await subprodutoRepo.findByEtiquetaId(String(subprodutoEtiqueta).trim());
      if (!sp) return { status: 404, body: { erro: 'Subproduto não encontrado' } };

      subprodutoIdResolved = sp.id;
      serieProdFinalIdResolved = sp.serieProdFinalId || null;
    } else {
      serieProdFinalIdResolved = String(serieProdFinalId).trim();
    }

    const consumoAtual = await consumoPecaRepo.findAtivoPorContexto({
      codigoPeca: String(codigoPeca).trim(),
      subprodutoId: subprodutoIdResolved,
      serieProdFinalId: serieProdFinalIdResolved
    });

    if (!consumoAtual) {
      return { status: 404, body: { erro: 'Peça ativa não encontrada no contexto informado' } };
    }

    const atualQrId = consumoAtual.qrId ? String(consumoAtual.qrId) : null;
    if (novoQrId && atualQrId && String(novoQrId) === atualQrId) {
      return {
        status: 400,
        body: { erro: 'Substituição inválida: o novo QR tem o mesmo ID do QR atual' }
      };
    }

    // trava por qrCode bruto (mantém compatibilidade)
    const qrAtivo = await consumoPecaRepo.findQrAtivo(novoQrCode);
    if (qrAtivo) {
      return { status: 400, body: { erro: 'Novo QR Code já está vinculado' } };
    }

    // trava por qrId (mais robusto)
    if (novoQrId) {
      const qrIdAtivo = await consumoPecaRepo.findQrIdAtivo(novoQrId);
      if (qrIdAtivo) {
        return { status: 400, body: { erro: 'Novo ID de QR Code já está vinculado' } };
      }
    }

    await prisma.$transaction(async (tx) => {
      await consumoPecaRepo.update(tx, consumoAtual.id, { fimEm: new Date() });

      await consumoPecaRepo.create(tx, {
        id: crypto.randomUUID(),
        opId: consumoAtual.opId,
        codigoPeca: consumoAtual.codigoPeca,
        qrCode: String(novoQrCode),
        qrId: novoQrId ? String(novoQrId) : null,
        funcionarioId: String(funcionarioId),
        subprodutoId: consumoAtual.subprodutoId,
        serieProdFinalId: consumoAtual.serieProdFinalId
      });
    });

    return { status: 200, body: { ok: true } };
  } catch (err) {
    console.error('Erro ao substituirPeca:', err);
    return { status: 500, body: { erro: 'Erro interno ao substituir peça' } };
  }
}

module.exports = { execute };
