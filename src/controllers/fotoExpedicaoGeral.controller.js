// src/controllers/fotoExpedicaoGeral.controller.js
const crypto = require('crypto');
const { prisma } = require('../database/prisma');

const uploadFotoGeral = async (req, res) => {
  try {
    const { expedicaoId, url, descricao } = req.body;

    if (!expedicaoId || !url) {
      return res.status(400).json({
        erro: 'expedicaoId e url são obrigatórios'
      });
    }

    const exp = await prisma.expedicao.findUnique({
      where: { id: expedicaoId },
      select: { id: true }
    });

    if (!exp) {
      return res.status(404).json({ erro: 'Expedição não encontrada' });
    }

    const foto = await prisma.fotoExpedicaoGeral.create({
      data: {
        id: crypto.randomUUID(),
        expedicaoId,
        url,
        descricao: descricao || null
      }
    });

    return res.json({ ok: true, foto });
  } catch (err) {
    console.error('Erro uploadFotoGeral:', err);
    return res.status(500).json({ erro: 'Erro interno ao salvar foto geral' });
  }
};

const listarFotosGerais = async (req, res) => {
  try {
    const { expedicaoId } = req.params;

    if (!expedicaoId) {
      return res.status(400).json({ erro: 'expedicaoId é obrigatório' });
    }

    const fotos = await prisma.fotoExpedicaoGeral.findMany({
      where: { expedicaoId },
      orderBy: { criadoEm: 'asc' }
    });

    return res.json({ ok: true, fotos });
  } catch (err) {
    console.error('Erro listarFotosGerais:', err);
    return res.status(500).json({ erro: 'Erro interno ao listar fotos gerais' });
  }
};

module.exports = {
  uploadFotoGeral,
  listarFotosGerais
};
