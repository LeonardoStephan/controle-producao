const crypto = require('crypto');
const { prisma } = require('../database/prisma');
const { buscarEtiquetaProdutoFinal } = require('../services/viaOnda.service');

const criarProdutoFinal = async (req, res) => {
  const { opId, serieProdutoFinal, empresa } = req.body;

  if (!opId || !serieProdutoFinal || !empresa) {
    return res.status(400).json({ erro: 'Dados obrigatórios ausentes' });
  }

  /* 1️⃣ OP existe */
  const op = await prisma.ordemProducao.findUnique({
    where: { id: opId }
  });

  if (!op) {
    return res.status(404).json({ erro: 'OP não encontrada' });
  }

  /* 2️⃣ Série pertence à OP final (ViaOnda) */
  const etiquetas = await buscarEtiquetaProdutoFinal(op.numeroOP, empresa);

  const pertenceOP = etiquetas.some(e => e.serie === serieProdutoFinal);

  if (!pertenceOP) {
    return res.status(400).json({
      erro: 'Série não pertence à OP final ou não foi impressa'
    });
  }

  /* 3️⃣ Impede série duplicada */
  const jaExiste = await prisma.produtoFinal.findUnique({
    where: { serie: serieProdutoFinal }
  });

  if (jaExiste) {
    return res.status(400).json({
      erro: 'Produto final já registrado com esta série'
    });
  }

  /* 4️⃣ Cria produto final */
  const produtoFinal = await prisma.produtoFinal.create({
    data: {
      id: crypto.randomUUID(),
      opId,
      serie: serieProdutoFinal
    }
  });

  return res.json({ ok: true, produtoFinal });
};

module.exports = { criarProdutoFinal };
