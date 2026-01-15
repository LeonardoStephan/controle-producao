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

  if (!produtoFinalId || !opNumeroSubproduto || !serie || !empresa || !funcionarioId)
    return res.status(400).json({ erro: 'Dados obrigatórios ausentes' });

    const produtoFinal = await prisma.produtoFinal.findUnique({
    where: { id: produtoFinalId }
  });

    if (!produtoFinal)
    return res.status(404).json({ erro: 'Produto final não encontrado' });

  if (produtoFinal.ordemProducao.status !== 'montagem')
    return res.status(400).json({
      erro: 'Consumo permitido apenas na montagem'
    });

  const ultimoEvento = await prisma.eventoOP.findFirst({
    where: {
      opId: produtoFinal.ordemProducao.id,
      etapa: 'montagem'
    },
    orderBy: { criadoEm: 'desc' }
  });

  if (!ultimoEvento || ultimoEvento.tipo === 'pausa')
    return res.status(400).json({
      erro: 'Montagem pausada ou não iniciada'
    });

  const jaConsumida = await prisma.subproduto.findUnique({
    where: { etiquetaId: serie }
  });

  if (jaConsumida)
    return res.status(400).json({ erro: 'Etiqueta de subproduto já usada' });

  const existe = await buscarEtiquetaSubproduto(
    opNumeroSubproduto,
    serie,
    empresa
  );

  if (!existe)
    return res.status(400).json({
      erro: 'Etiqueta não existe na OP do subproduto'
    });

  const consumo = await prisma.subproduto.create({
    data: {
      id: crypto.randomUUID(),
      produtoFinalId,
      opNumeroSubproduto,
      etiquetaId: serie,
      funcionarioId,
      tipo: 'subproduto',
      quantidade: 1
    }
  });

  res.json({ ok: true, consumo });
};

module.exports = { consumirSubproduto };
