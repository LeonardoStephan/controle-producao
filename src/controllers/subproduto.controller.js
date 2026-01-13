const crypto = require('crypto');
const axios = require('axios');
const { prisma } = require('../database/prisma');

/* =====================================================
   FUNÇÃO AUXILIAR PARA VALIDAR ETIQUETA NA API EXTERNA
===================================================== */
async function validarEtiquetaNaAPI(opNumero, etiquetaId, empresa) {
  const appHash = empresa === 'marchi' ? 'marchi-01i5xgxk' : 'gs-01i4odn5';

  try {
    const response = await axios.post(
      'http://restrito.viaondarfid.com.br/api/reimprimir_etiqueta.php',
      { appHash, numOrdemProducao: opNumero }
    );

    const etiquetasDaAPI = response.data.data || []; // o array vem em "data"
    // Validar se existe alguma etiqueta com mesmo número de série e mesma OP
    return etiquetasDaAPI.some(
      e => e.num_ordem_producao === opNumero && e.serie === etiquetaId
    );
  } catch (err) {
    console.error('Erro ao consultar API de etiquetas:', err.message);
    throw new Error('Falha na validação da etiqueta na API externa');
  }
}

/* =====================================================
   ADICIONAR SUBPRODUTO INDIVIDUAL COM VALIDAÇÃO API
===================================================== */
const adicionarSubproduto = async (req, res) => {
  const { opId, etiquetaId, tipo, quantidade, funcionarioId, empresa } = req.body;

  if (!opId || !etiquetaId || !tipo || quantidade == null || !funcionarioId || !empresa) {
    return res.status(400).json({
      erro: 'opId, etiquetaId, tipo, quantidade, funcionarioId e empresa são obrigatórios',
    });
  }

  try {
    const op = await prisma.ordemProducao.findUnique({ where: { id: opId } });
    if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

    const existente = await prisma.subproduto.findUnique({ where: { etiquetaId } });
    if (existente)
      return res.status(400).json({ erro: `Etiqueta ${etiquetaId} já registrada` });

    const valida = await validarEtiquetaNaAPI(op.numeroOP, etiquetaId, empresa);
    if (!valida)
      return res.status(400).json({
        erro: `Etiqueta ${etiquetaId} não pertence à OP ou não existe na API`,
      });

    const subproduto = await prisma.subproduto.create({
      data: {
        id: crypto.randomUUID(),
        opId,
        etiquetaId, // <- armazenando o número de série
        tipo,
        quantidade: parseInt(quantidade, 10) || 1,
        funcionarioId,
        criadoEm: new Date(),
      },
    });

    return res.status(201).json({ ok: true, subproduto });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao adicionar subproduto', detalhes: err.message });
  }
};

/* =====================================================
   ADICIONAR MÚLTIPLOS SUBPRODUTOS (BATCH) COM VALIDAÇÃO API
===================================================== */
const adicionarSubprodutosBatch = async (req, res) => {
  const subprodutos = req.body;

  if (!Array.isArray(subprodutos) || subprodutos.length === 0)
    return res.status(400).json({ erro: 'Envie um array de subprodutos' });

  const registros = [];

  try {
    for (const sp of subprodutos) {
      const { opId, etiquetaId, tipo, quantidade, funcionarioId, empresa } = sp;

      if (!opId || !etiquetaId || !tipo || !quantidade || !funcionarioId || !empresa) {
        return res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
      }

      const op = await prisma.ordemProducao.findUnique({ where: { id: opId } });
      if (!op) return res.status(404).json({ erro: `OP ${opId} não encontrada` });

      const existente = await prisma.subproduto.findUnique({ where: { etiquetaId } });
      if (existente)
        return res.status(400).json({ erro: `Etiqueta ${etiquetaId} já registrada` });

      const valida = await validarEtiquetaNaAPI(op.numeroOP, etiquetaId, empresa);
      if (!valida)
        return res.status(400).json({
          erro: `Etiqueta ${etiquetaId} não pertence à OP ou não existe na API`,
        });

      const registro = await prisma.subproduto.create({
        data: {
          id: crypto.randomUUID(),
          opId,
          etiquetaId, // <- número de série armazenado
          tipo,
          quantidade: parseInt(quantidade, 10) || 1,
          funcionarioId,
          criadoEm: new Date(),
        },
      });

      registros.push(registro);
    }

    return res.json({ ok: true, registros });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao adicionar subprodutos', detalhes: err.message });
  }
};

/* =====================================================
   LISTAR SUBPRODUTOS DE UMA OP
===================================================== */
const listarSubprodutos = async (req, res) => {
  const { opId } = req.params;
  if (!opId) return res.status(400).json({ erro: 'opId é obrigatório' });

  try {
    const subprodutos = await prisma.subproduto.findMany({ where: { opId } });
    return res.json(subprodutos);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao buscar subprodutos', detalhes: err.message });
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
    const subproduto = await prisma.subproduto.findUnique({ where: { id } });
    if (!subproduto) return res.status(404).json({ erro: 'Subproduto não encontrado' });

    const atualizado = await prisma.subproduto.update({
      where: { id },
      data: {
        tipo: tipo || subproduto.tipo,
        quantidade: parseInt(quantidade, 10) ?? subproduto.quantidade,
        funcionarioId: funcionarioId || subproduto.funcionarioId,
      },
    });

    return res.json({ ok: true, subproduto: atualizado });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao atualizar subproduto', detalhes: err.message });
  }
};

/* =====================================================
   REMOVER SUBPRODUTO
===================================================== */
const removerSubproduto = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ erro: 'ID do subproduto é obrigatório' });

  try {
    const subproduto = await prisma.subproduto.findUnique({ where: { id } });
    if (!subproduto) return res.status(404).json({ erro: 'Subproduto não encontrado' });

    await prisma.subproduto.delete({ where: { id } });
    return res.json({ ok: true, mensagem: 'Subproduto removido' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao remover subproduto', detalhes: err.message });
  }
};

module.exports = {
  adicionarSubproduto,
  adicionarSubprodutosBatch,
  listarSubprodutos,
  atualizarSubproduto,
  removerSubproduto,
};
