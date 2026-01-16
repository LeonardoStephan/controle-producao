const crypto = require('crypto');
const { prisma } = require('../database/prisma');
const { buscarEtiquetaSubproduto } = require('../services/viaOnda.service');
const axios = require('axios');

// Cache simples em memória para BOM por produto (5 min)
const bomCache = new Map();
const CACHE_TEMPO = 5 * 60 * 1000; // 5 minutos

/* =========================
   Valida subproduto no BOM Omie
========================= */
async function validarSubprodutoNoBOM(codSubproduto, codProdutoOmie, empresa, appKey, appSecret) {
  const cacheKey = `${empresa}_${codProdutoOmie}`;
  const cache = bomCache.get(cacheKey);

  if (cache && Date.now() - cache.timestamp < CACHE_TEMPO) {
    return cache.itens.some(item => item.codProdMalha === codSubproduto);
  }

  try {
    const response = await axios.post(
      'https://app.omie.com.br/api/v1/geral/malha/',
      {
        call: "ConsultarEstrutura",
        param: [{ codProduto: codProdutoOmie }],
        app_key: appKey,
        app_secret: appSecret
      }
    );

    const bom = response.data.itens || [];
    bomCache.set(cacheKey, { itens: bom, timestamp: Date.now() });

    return bom.some(item => item.codProdMalha === codSubproduto);
  } catch (err) {
    console.error('Erro ao consultar BOM Omie', err.message);
    throw new Error('Falha ao validar subproduto no BOM Omie');
  }
}

/* =========================
   CONSUMO DE SUBPRODUTO
========================= */
const consumirSubproduto = async (req, res) => {
  const {
    produtoFinalId,
    opNumeroSubproduto,
    serie,
    codProdutoOmie, // necessário para consultar o BOM
    empresa,
    funcionarioId,
    omieAppKey,
    omieAppSecret
  } = req.body;

  if (!produtoFinalId || !opNumeroSubproduto || !serie || !empresa || !funcionarioId || !codProdutoOmie) {
    return res.status(400).json({ erro: 'Dados obrigatórios ausentes' });
  }

  try {
    /* 1️⃣ Produto final existe + OP carregada */
    const produtoFinal = await prisma.produtoFinal.findUnique({
      where: { id: produtoFinalId },
      include: { ordemProducao: true, subprodutos: true }
    });

    if (!produtoFinal) return res.status(404).json({ erro: 'Produto final não encontrado' });

    /* 2️⃣ Só pode consumir na montagem */
    if (produtoFinal.ordemProducao.status !== 'montagem') {
      return res.status(400).json({ erro: 'Consumo permitido apenas na etapa de montagem' });
    }

    /* 3️⃣ Montagem não pode estar pausada */
    const ultimoEvento = await prisma.eventoOP.findFirst({
      where: { opId: produtoFinal.ordemProducao.id, etapa: 'montagem' },
      orderBy: { criadoEm: 'desc' }
    });

    if (!ultimoEvento || ultimoEvento.tipo === 'pausa') {
      return res.status(400).json({ erro: 'Montagem pausada ou não iniciada' });
    }

    /* 4️⃣ Limite por produto final (1:1 por enquanto) */
    if (produtoFinal.subprodutos.length >= 1) {
      return res.status(400).json({ erro: 'Este produto final já possui um subproduto vinculado' });
    }

    /* 5️⃣ Evita reutilizar etiqueta */
    const jaConsumida = await prisma.subproduto.findUnique({ where: { etiquetaId: serie } });
    if (jaConsumida) return res.status(400).json({ erro: 'Etiqueta de subproduto já utilizada' });

    /* 6️⃣ Validação na API externa ViaOnda */
    const existeViaOnda = await buscarEtiquetaSubproduto(opNumeroSubproduto, serie, empresa);
    if (!existeViaOnda) return res.status(400).json({ erro: 'Etiqueta não existe ou não pertence à OP do subproduto' });

    /* 7️⃣ Validação no BOM Omie */
    const validoBOM = await validarSubprodutoNoBOM(opNumeroSubproduto, codProdutoOmie, empresa, omieAppKey, omieAppSecret);
    if (!validoBOM) return res.status(400).json({ erro: 'Subproduto não pertence ao BOM do produto final' });

    /* 8️⃣ Registra consumo */
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

  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
};

module.exports = { consumirSubproduto };
