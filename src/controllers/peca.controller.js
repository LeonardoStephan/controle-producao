const crypto = require('crypto');
const { prisma } = require('../database/prisma');

/* =========================
   CONSUMO DE PEÇA (QR CODE)
========================= */
const consumirPeca = async (req, res) => {
  const {
    codigoPeca,
    qrCode,
    funcionarioId,
    subprodutoId,
    produtoFinalId
  } = req.body;

  if (!codigoPeca || !qrCode || !funcionarioId) {
    return res.status(400).json({ erro: 'Dados obrigatórios ausentes' });
  }

  // garante apenas um contexto
  if (
    (!subprodutoId && !produtoFinalId) ||
    (subprodutoId && produtoFinalId)
  ) {
    return res.status(400).json({
      erro: 'Informe apenas subprodutoId ou produtoFinalId'
    });
  }

  /* 1️⃣ Validação de contexto + OP */
  if (subprodutoId) {
    const subproduto = await prisma.subproduto.findUnique({
      where: { id: subprodutoId },
      include: {
        produtoFinal: {
          include: { ordemProducao: true }
        }
      }
    });

    if (!subproduto) {
      return res.status(404).json({ erro: 'Subproduto não encontrado' });
    }

    if (subproduto.produtoFinal.ordemProducao.status !== 'montagem') {
      return res.status(400).json({
        erro: 'Vínculo permitido apenas na montagem'
      });
    }
  }

  if (produtoFinalId) {
    const produtoFinal = await prisma.produtoFinal.findUnique({
      where: { id: produtoFinalId },
      include: { ordemProducao: true }
    });

    if (!produtoFinal) {
      return res.status(404).json({ erro: 'Produto final não encontrado' });
    }

    if (produtoFinal.ordemProducao.status !== 'montagem') {
      return res.status(400).json({
        erro: 'Vínculo permitido apenas na montagem'
      });
    }
  }

  /* 2️⃣ QR Code não pode estar ativo */
  const qrJaUsado = await prisma.consumoPeca.findFirst({
    where: {
      qrCode,
      fimEm: null
    }
  });

  if (qrJaUsado) {
    return res.status(400).json({
      erro: 'Este QR Code já está vinculado'
    });
  }

  /* 3️⃣ Cria consumo */
  const consumo = await prisma.consumoPeca.create({
    data: {
      id: crypto.randomUUID(),
      codigoPeca,
      qrCode,
      funcionarioId,
      subprodutoId: subprodutoId || null,
      produtoFinalId: produtoFinalId || null
    }
  });

  return res.json({ ok: true, consumo });
};

/* =========================
   SUBSTITUIÇÃO (MANUTENÇÃO)
========================= */
const substituirPeca = async (req, res) => {
  const { consumoPecaId, novoQrCode, funcionarioId } = req.body;

  if (!consumoPecaId || !novoQrCode || !funcionarioId) {
    return res.status(400).json({ erro: 'Dados obrigatórios ausentes' });
  }

  const consumoAtual = await prisma.consumoPeca.findUnique({
    where: { id: consumoPecaId }
  });

  if (!consumoAtual || consumoAtual.fimEm) {
    return res.status(404).json({
      erro: 'Consumo ativo não encontrado'
    });
  }

  /* 1️⃣ Novo QR não pode estar em uso */
  const qrJaUsado = await prisma.consumoPeca.findFirst({
    where: {
      qrCode: novoQrCode,
      fimEm: null
    }
  });

  if (qrJaUsado) {
    return res.status(400).json({
      erro: 'Novo QR Code já está vinculado'
    });
  }

  /* 2️⃣ Finaliza consumo antigo */
  await prisma.consumoPeca.update({
    where: { id: consumoPecaId },
    data: { fimEm: new Date() }
  });

  /* 3️⃣ Cria novo vínculo */
  const novoConsumo = await prisma.consumoPeca.create({
    data: {
      id: crypto.randomUUID(),
      codigoPeca: consumoAtual.codigoPeca,
      qrCode: novoQrCode,
      funcionarioId,
      subprodutoId: consumoAtual.subprodutoId,
      produtoFinalId: consumoAtual.produtoFinalId
    }
  });

  return res.json({ ok: true, novoConsumo });
};

/* =========================
   HISTÓRICO
========================= */
const historicoPecas = async (req, res) => {
  const { subprodutoId, produtoFinalId } = req.query;

  if (
    (!subprodutoId && !produtoFinalId) ||
    (subprodutoId && produtoFinalId)
  ) {
    return res.status(400).json({
      erro: 'Informe apenas subprodutoId ou produtoFinalId'
    });
  }

  const consumos = await prisma.consumoPeca.findMany({
    where: {
      subprodutoId: subprodutoId || undefined,
      produtoFinalId: produtoFinalId || undefined
    },
    orderBy: { inicioEm: 'asc' }
  });

  return res.json({ consumos });
};

module.exports = {
  consumirPeca,
  substituirPeca,
  historicoPecas
};
