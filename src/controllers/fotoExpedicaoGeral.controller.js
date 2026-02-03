const crypto = require('crypto');
const { prisma } = require('../database/prisma');

/* =========================
   UPLOAD FOTO GERAL
========================= */
const uploadFotoGeral = async (req, res) => {
  const { expedicaoId, url, descricao } = req.body;

  if (!expedicaoId || !url) {
    return res.status(400).json({
      erro: 'expedicaoId e url são obrigatórios'
    });
  }

  const expedicao = await prisma.expedicao.findUnique({
    where: { id: expedicaoId }
  });

  if (!expedicao) {
    return res.status(404).json({
      erro: 'Expedição não encontrada'
    });
  }

  if (expedicao.status !== 'ativa') {
    return res.status(400).json({
      erro: 'Só é permitido adicionar fotos em expedições ativas'
    });
  }

  const foto = await prisma.fotoExpedicaoGeral.create({
    data: {
      id: crypto.randomUUID(),
      expedicaoId,
      url,
      descricao
    }
  });

  return res.json({ ok: true, foto });
};

/* =========================
   LISTAR FOTOS GERAIS
========================= */
const listarFotosGerais = async (req, res) => {
  const { expedicaoId } = req.params;

  const fotos = await prisma.fotoExpedicaoGeral.findMany({
    where: { expedicaoId },
    orderBy: { criadoEm: 'asc' }
  });

  return res.json({ fotos });
};

module.exports = {
  uploadFotoGeral,
  listarFotosGerais
};
