const { prisma } = require('../database/prisma');

/* =====================================================
   RECEBER EVENTO OMIE
   ===================================================== */
exports.receberEventoOmie = async (req, res) => {
  const { etiquetaId, opId, tipo, quantidade, funcionarioId, payload } = req.body;

  if (!etiquetaId || !opId) {
    return res.status(400).json({ erro: 'etiquetaId e opId são obrigatórios' });
  }

  try {
    // Verifica se a OP existe
    const op = await prisma.ordens_producao.findUnique({ where: { id: opId } });
    if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

    // Verifica duplicidade da etiqueta
    const existente = await prisma.subprodutos.findUnique({ where: { etiquetaId } });
    if (existente) return res.json({ ok: true, duplicado: true });

    // Cria o subproduto vinculado à OP
    await prisma.subprodutos.create({
      data: {
        op_id: opId,
        etiqueta_id: etiquetaId,
        tipo: tipo || 'omie',
        quantidade: quantidade || 1,
        funcionario_id: funcionarioId || 'omie',
      },
    });

    // Registra evento de subproduto registrado
    await prisma.eventos_op.create({
      data: {
        op_id: opId,
        tipo: 'subproduto_registrado',
        etapa: op.status,
        funcionario_id: funcionarioId || 'omie',
        dados: { etiquetaId, payload },
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao processar evento Omie' });
  }
};
