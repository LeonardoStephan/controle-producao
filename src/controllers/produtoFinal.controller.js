const crypto = require('crypto');
const { prisma } = require('../database/prisma');
const { buscarEtiquetaProdutoFinal } = require('../services/viaOnda.service');

/* =========================
   CRIAR PRODUTO FINAL
========================= */
const criarProdutoFinal = async (req, res) => {
  const {
    opId,
    serieProdutoFinal,
    empresa,
    codProdutoOmie
  } = req.body;

  /* 1️⃣ Validações básicas */
  if (!opId || !serieProdutoFinal || !empresa) {
    return res.status(400).json({
      erro: 'opId, serieProdutoFinal e empresa são obrigatórios'
    });
  }

  /* 2️⃣ OP existe */
  const op = await prisma.ordemProducao.findUnique({
    where: { id: opId }
  });

  if (!op) {
    return res.status(404).json({ erro: 'OP não encontrada' });
  }

  /* 3️⃣ Impede duplicação de série */
  const jaExiste = await prisma.produtoFinal.findUnique({
    where: { serie: serieProdutoFinal }
  });

  if (jaExiste) {
    return res.status(400).json({
      erro: 'Produto final já registrado com esta série'
    });
  }

  /* 4️⃣ Valida série na ViaOnda */
  const etiquetas = await buscarEtiquetaProdutoFinal(op.numeroOP, empresa);

  const pertence = etiquetas.some(e => e.serie === serieProdutoFinal);
  if (!pertence) {
    return res.status(400).json({
      erro: 'Série não pertence à OP ou não foi impressa'
    });
  }

  /* 5️⃣ Cria produto final */
  const produtoFinal = await prisma.produtoFinal.create({
    data: {
      id: crypto.randomUUID(),
      opId,
      serie: serieProdutoFinal,
      codProdutoOmie: codProdutoOmie || null
    }
  });

  return res.json({
    ok: true,
    produtoFinal
  });
};

module.exports = {
  criarProdutoFinal
};
