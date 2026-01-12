const { prisma } = require('../database/prisma');

/* =====================================================
   ADICIONAR SUBPRODUTO A UMA OP
   ===================================================== */
const adicionarSubproduto = async (req, res) => {
  const { opId, etiquetaId, tipo, quantidade, funcionarioId } = req.body;

  if (!opId || !etiquetaId || !tipo || quantidade == null || !funcionarioId) {
    return res.status(400).json({
      erro: 'opId, etiquetaId, tipo, quantidade e funcionarioId são obrigatórios',
    });
  }

  try {
    // Verifica se OP existe
    const op = await prisma.ordens_producao.findUnique({ where: { id: opId } });
    if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

    // Verifica duplicidade da etiqueta
    const existente = await prisma.subprodutos.findUnique({ where: { etiquetaId } });
    if (existente)
      return res.status(400).json({ erro: 'Etiqueta já registrada para outra OP' });

    const subproduto = await prisma.subprodutos.create({
      data: { op_id: opId, etiqueta_id: etiquetaId, tipo, quantidade, funcionario_id: funcionarioId },
    });

    return res.status(201).json({ ok: true, subproduto });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao adicionar subproduto' });
  }
};

/* =====================================================
   LISTAR SUBPRODUTOS DE UMA OP
   ===================================================== */
const listarSubprodutos = async (req, res) => {
  const { opId } = req.params;

  if (!opId) return res.status(400).json({ erro: 'opId é obrigatório' });

  try {
    const subprodutos = await prisma.subprodutos.findMany({
      where: { op_id: opId },
    });

    return res.json(subprodutos);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao buscar subprodutos' });
  }
};

/* =====================================================
   ATUALIZAR SUBPRODUTO
   ===================================================== */
const atualizarSubproduto = async (req, res) => {
  const { id } = req.params;
  const { tipo, quantidade, funcionarioId } = req.body;

  if (!id) return res.status(400).json({ erro: 'ID do subproduto é obrigatório' });

  try {
    const subproduto = await prisma.subprodutos.findUnique({ where: { id } });
    if (!subproduto) return res.status(404).json({ erro: 'Subproduto não encontrado' });

    const atualizado = await prisma.subprodutos.update({
      where: { id },
      data: { tipo: tipo || subproduto.tipo, quantidade: quantidade ?? subproduto.quantidade, funcionario_id: funcionarioId || subproduto.funcionarioId },
    });

    return res.json({ ok: true, subproduto: atualizado });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao atualizar subproduto' });
  }
};

/* =====================================================
   REMOVER SUBPRODUTO
   ===================================================== */
const removerSubproduto = async (req, res) => {
  const { id } = req.params;

  if (!id) return res.status(400).json({ erro: 'ID do subproduto é obrigatório' });

  try {
    const subproduto = await prisma.subprodutos.findUnique({ where: { id } });
    if (!subproduto) return res.status(404).json({ erro: 'Subproduto não encontrado' });

    await prisma.subprodutos.delete({ where: { id } });

    return res.json({ ok: true, mensagem: 'Subproduto removido' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao remover subproduto' });
  }
};

module.exports = {
  adicionarSubproduto,
  listarSubprodutos,
  atualizarSubproduto,
  removerSubproduto,
};
