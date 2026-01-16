const crypto = require('crypto');
const { prisma } = require('../database/prisma');
const { buscarEtiquetaSubproduto } = require('../services/viaOnda.service');

const consumirSubproduto = async (req, res) => {
  const {
    produtoFinalId,
    opNumeroSubproduto,
    serie,
    empresa,
    funcionarioId
  } = req.body;

  if (!produtoFinalId || !opNumeroSubproduto || !serie || !empresa || !funcionarioId) {
    return res.status(400).json({ erro: 'Dados obrigatórios ausentes' });
  }

  /* 1️⃣ Produto final existe + OP carregada */
  const produtoFinal = await prisma.produtoFinal.findUnique({
    where: { id: produtoFinalId },
    include: {
      ordemProducao: true,
      subprodutos: true
    }
  });

  if (!produtoFinal) {
    return res.status(404).json({ erro: 'Produto final não encontrado' });
  }

  /* 2️⃣ Só pode consumir na montagem */
  if (produtoFinal.ordemProducao.status !== 'montagem') {
    return res.status(400).json({
      erro: 'Consumo permitido apenas na etapa de montagem'
    });
  }

  /* 3️⃣ Montagem não pode estar pausada */
  const ultimoEvento = await prisma.eventoOP.findFirst({
    where: {
      opId: produtoFinal.ordemProducao.id,
      etapa: 'montagem'
    },
    orderBy: { criadoEm: 'desc' }
  });

  if (!ultimoEvento || ultimoEvento.tipo === 'pausa') {
    return res.status(400).json({
      erro: 'Montagem pausada ou não iniciada'
    });
  }

  /* 4️⃣ Limite por produto final (1:1 por enquanto) */
  if (produtoFinal.subprodutos.length >= 1) {
    return res.status(400).json({
      erro: 'Este produto final já possui um subproduto vinculado'
    });
  }

  /* 5️⃣ Evita reutilizar etiqueta */
  const jaConsumida = await prisma.subproduto.findUnique({
    where: { etiquetaId: serie }
  });

  if (jaConsumida) {
    return res.status(400).json({
      erro: 'Etiqueta de subproduto já utilizada'
    });
  }

  /* 6️⃣ Validação na API externa */
  const existe = await buscarEtiquetaSubproduto(
    opNumeroSubproduto,
    serie,
    empresa
  );

  if (!existe) {
    return res.status(400).json({
      erro: 'Etiqueta não existe ou não pertence à OP do subproduto'
    });
  }

  /* 7️⃣ Registra consumo */
  const consumo = await prisma.subproduto.create({
    data: {
      id: crypto.randomUUID(),
      produtoFinalId,
      opNumeroSubproduto,
      etiquetaId: serie,
      funcionarioId,
      quantidade: 1
    }
  });

  return res.json({ ok: true, consumo });
};

module.exports = { consumirSubproduto };
