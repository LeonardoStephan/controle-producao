const crypto = require('crypto');
const { prisma } = require('../database/prisma');
const axios = require('axios');

// Cache simples em memória para BOM por produto (5 min)
const bomCache = new Map();
const CACHE_TEMPO = 5 * 60 * 1000; // 5 minutos

/* =========================
   FUNÇÃO AUXILIAR: Valida peça no BOM Omie
========================= */
async function validarPecaNoBOM(codigoPeca, codProdutoOmie, empresa) {
  const cacheKey = `${empresa}_${codProdutoOmie}`;
  const cache = bomCache.get(cacheKey);

  // Usa cache se ainda for válido
  if (cache && Date.now() - cache.timestamp < CACHE_TEMPO) {
    return cache.itens.some(item => item.codProdMalha === codigoPeca);
  }

  try {
    const response = await axios.post('https://app.omie.com.br/api/v1/geral/malha/', {
      call: "ConsultarEstrutura",
      param: [{ codProduto: codProdutoOmie }],
      app_key: process.env.OMIE_APP_KEY,
      app_secret: process.env.OMIE_APP_SECRET
    });

    const bom = response.data.itens || [];
    bomCache.set(cacheKey, { itens: bom, timestamp: Date.now() });

    return bom.some(item => item.codProdMalha === codigoPeca);
  } catch (err) {
    console.error('Erro ao consultar BOM Omie:', err.message);
    throw new Error('Falha ao validar peça no BOM Omie');
  }
}

/* =========================
   CONSUMO DE PEÇA
========================= */
const consumirPeca = async (req, res) => {
  const { codigoPeca, qrCode, funcionarioId, subprodutoId, produtoFinalId, empresa } = req.body;

  if (!codigoPeca || !qrCode || !funcionarioId || !empresa) {
    return res.status(400).json({ erro: 'Dados obrigatórios ausentes' });
  }

  if ((!subprodutoId && !produtoFinalId) || (subprodutoId && produtoFinalId)) {
    return res.status(400).json({ erro: 'Informe apenas subprodutoId ou produtoFinalId' });
  }

  let codProdutoOmie;

  try {
    // 1️⃣ Validação de contexto + OP
    if (produtoFinalId) {
      const produtoFinal = await prisma.produtoFinal.findUnique({
        where: { id: produtoFinalId },
        include: { ordemProducao: true }
      });

      if (!produtoFinal) return res.status(404).json({ erro: 'Produto final não encontrado' });
      if (produtoFinal.ordemProducao.status !== 'montagem') {
        return res.status(400).json({ erro: 'Consumo permitido apenas na montagem' });
      }

      codProdutoOmie = produtoFinal.codProdutoOmie;
    }

    if (subprodutoId) {
      const subproduto = await prisma.subproduto.findUnique({
        where: { id: subprodutoId },
        include: { produtoFinal: { include: { ordemProducao: true } } }
      });

      if (!subproduto) return res.status(404).json({ erro: 'Subproduto não encontrado' });
      if (subproduto.produtoFinal.ordemProducao.status !== 'montagem') {
        return res.status(400).json({ erro: 'Consumo permitido apenas na montagem' });
      }

      codProdutoOmie = subproduto.produtoFinal.codProdutoOmie;
    }

    // 2️⃣ QR não pode estar ativo
    const qrJaUsado = await prisma.consumoPeca.findFirst({ where: { qrCode, fimEm: null } });
    if (qrJaUsado) return res.status(400).json({ erro: 'Este QR Code já está vinculado' });

    // 3️⃣ Valida peça no BOM Omie
    const valido = await validarPecaNoBOM(codigoPeca, codProdutoOmie, empresa);
    if (!valido) return res.status(400).json({ erro: 'Peça não pertence ao BOM do produto final' });

    // 4️⃣ Cria consumo
    const consumo = await prisma.consumoPeca.create({
      data: {
        id: crypto.randomUUID(),
        codigoPeca,
        qrCode,
        funcionarioId,
        subprodutoId: subprodutoId || null,
        produtoFinalId: produtoFinalId || null
      }
    });

    return res.json({ ok: true, consumo });
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
};

/* =========================
   SUBSTITUIÇÃO
========================= */
const substituirPeca = async (req, res) => {
  const { consumoPecaId, novoQrCode, funcionarioId } = req.body;

  if (!consumoPecaId || !novoQrCode || !funcionarioId) {
    return res.status(400).json({ erro: 'Dados obrigatórios ausentes' });
  }

  try {
    const consumoAtual = await prisma.consumoPeca.findUnique({ where: { id: consumoPecaId } });
    if (!consumoAtual || consumoAtual.fimEm) return res.status(404).json({ erro: 'Consumo ativo não encontrado' });

    const qrJaUsado = await prisma.consumoPeca.findFirst({ where: { qrCode: novoQrCode, fimEm: null } });
    if (qrJaUsado) return res.status(400).json({ erro: 'Novo QR Code já está vinculado' });

    await prisma.consumoPeca.update({ where: { id: consumoPecaId }, data: { fimEm: new Date() } });

    const novoConsumo = await prisma.consumoPeca.create({
      data: {
        id: crypto.randomUUID(),
        codigoPeca: consumoAtual.codigoPeca,
        qrCode: novoQrCode,
        funcionarioId,
        subprodutoId: consumoAtual.subprodutoId,
        produtoFinalId: consumoAtual.produtoFinalId
      }
    });

    return res.json({ ok: true, novoConsumo });
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
};

/* =========================
   HISTÓRICO
========================= */
const historicoPecas = async (req, res) => {
  const { subprodutoId, produtoFinalId } = req.query;

  if ((!subprodutoId && !produtoFinalId) || (subprodutoId && produtoFinalId)) {
    return res.status(400).json({ erro: 'Informe apenas subprodutoId ou produtoFinalId' });
  }

  try {
    const consumos = await prisma.consumoPeca.findMany({
      where: {
        subprodutoId: subprodutoId || undefined,
        produtoFinalId: produtoFinalId || undefined
      },
      orderBy: { inicioEm: 'asc' }
    });

    return res.json({ consumos });
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
};

module.exports = { consumirPeca, substituirPeca, historicoPecas };
