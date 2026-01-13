const crypto = require('crypto');
const { prisma } = require('../database/prisma');

/* =====================================================
   RECEBER EVENTO OMIE
   ===================================================== */
const receberEventoOmie = async (req, res) => {
  const { etiquetaId, opId, tipo, quantidade, funcionarioId, payload } = req.body;

  if (!etiquetaId || !opId) {
    return res.status(400).json({ erro: 'etiquetaId e opId são obrigatórios' });
  }

  try {
    // Verifica se a OP existe
    const op = await prisma.ordemProducao.findUnique({ where: { id: opId } });
    if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

    // Verifica duplicidade da etiqueta
    const existente = await prisma.subproduto.findUnique({ where: { etiquetaId } });
    if (existente) return res.json({ ok: true, duplicado: true });

    // Cria o subproduto vinculado à OP
    await prisma.subproduto.create({
      data: {
        id: crypto.randomUUID(),
        opId,
        etiquetaId,
        tipo: tipo || 'omie',
        quantidade: quantidade || 1,
        funcionarioId: funcionarioId || 'omie',
        criadoEm: new Date()
      },
    });

    // Registra evento de subproduto registrado
    await prisma.eventoOP.create({
      data: {
        id: crypto.randomUUID(),
        opId,
        tipo: 'subproduto_registrado',
        etapa: op.status,
        funcionarioId: funcionarioId || 'omie',
        dados: { etiquetaId, payload },
        criadoEm: new Date()
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao processar evento Omie', detalhes: err.message });
  }
};

module.exports = { receberEventoOmie };
