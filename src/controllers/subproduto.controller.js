const crypto = require('crypto');
const { prisma } = require('../database/prisma');
const { buscarEtiquetaProdutoFinal } = require('../services/viaOnda.service');
const axios = require('axios');

/* =========================
   Cache simples BOM Omie
========================= */
const bomCache = new Map();
const CACHE_TEMPO = 5 * 60 * 1000;

/* =========================
   Valida subproduto no BOM Omie
   (opcional)
========================= */
async function validarSubprodutoNoBOM(
  codSubproduto,
  codProdutoOmie,
  empresa,
  appKey,
  appSecret
) {
  if (!codProdutoOmie) return true;

  const cacheKey = `${empresa}_${codProdutoOmie}`;
  const cache = bomCache.get(cacheKey);

  if (cache && Date.now() - cache.timestamp < CACHE_TEMPO) {
    return cache.itens.some(i => i.codProdMalha === codSubproduto);
  }

  const response = await axios.post(
    'https://app.omie.com.br/api/v1/geral/malha/',
    {
      call: 'ConsultarEstrutura',
      param: [{ codProduto: codProdutoOmie }],
      app_key: appKey,
      app_secret: appSecret
    }
  );

  const itens = response.data.itens || [];
  bomCache.set(cacheKey, { itens, timestamp: Date.now() });

  return itens.some(i => i.codProdMalha === codSubproduto);
}

/* =========================
   CONSUMO DE SUBPRODUTO
========================= */
const consumirSubproduto = async (req, res) => {
  const {
    opId,
    produtoFinalId,
    opNumeroSubproduto,
    serie,
    empresa,
    funcionarioId,
    quantidade = 1,

    // BOM Omie (opcional)
    codProdutoOmie,
    omieAppKey,
    omieAppSecret
  } = req.body;

  /* 1️⃣ Validações básicas */
  if (!opId || !opNumeroSubproduto || !serie || !empresa || !funcionarioId) {
    return res.status(400).json({ erro: 'Dados obrigatórios ausentes' });
  }

  /* 2️⃣ OP existe */
  const op = await prisma.ordemProducao.findUnique({
    where: { id: opId }
  });

  if (!op) {
    return res.status(404).json({ erro: 'OP não encontrada' });
  }

  /* 3️⃣ Apenas na montagem */
  if (op.status !== 'montagem') {
    return res.status(400).json({
      erro: 'Consumo de subproduto permitido apenas na montagem'
    });
  }

  /* 4️⃣ Montagem ativa (não pausada nem finalizada) */
  const ultimoEvento = await prisma.eventoOP.findFirst({
    where: { opId, etapa: 'montagem' },
    orderBy: { criadoEm: 'desc' }
  });

  if (!ultimoEvento || ultimoEvento.tipo === 'pausa') {
    return res.status(400).json({
      erro: 'Montagem pausada ou não iniciada'
    });
  }

  if (ultimoEvento.tipo === 'fim') {
    return res.status(400).json({
      erro: 'Montagem já foi finalizada'
    });
  }

  /* 5️⃣ Evita reutilizar etiqueta */
  const jaConsumido = await prisma.subproduto.findUnique({
    where: { etiquetaId: serie }
  });

  if (jaConsumido) {
    return res.status(400).json({
      erro: 'Etiqueta de subproduto já utilizada'
    });
  }

  /* 6️⃣ Validação ViaOnda (reimprimir_etiqueta) */
  const etiquetas = await buscarEtiquetaProdutoFinal(
    opNumeroSubproduto,
    empresa
  );

  if (!etiquetas || etiquetas.length === 0) {
    return res.status(400).json({
      erro: 'OP de subproduto não encontrada na ViaOnda'
    });
  }

  const pertence = etiquetas.some(e => e.serie === serie);

  if (!pertence) {
    return res.status(400).json({
      erro: 'Etiqueta não pertence à OP do subproduto'
    });
  }

  /* 7️⃣ Validação BOM Omie (opcional) */
  const validoBOM = await validarSubprodutoNoBOM(
    opNumeroSubproduto,
    codProdutoOmie,
    empresa,
    omieAppKey,
    omieAppSecret
  );

  if (!validoBOM) {
    return res.status(400).json({
      erro: 'Subproduto não pertence ao BOM do produto'
    });
  }

  /* 8️⃣ Cria subproduto */
  const subproduto = await prisma.subproduto.create({
    data: {
      id: crypto.randomUUID(),
      opId,
      produtoFinalId: produtoFinalId || null,
      opNumeroSubproduto,
      etiquetaId: serie,
      funcionarioId,
      quantidade
    }
  });

  /* 9️⃣ Evento de consumo */
  await prisma.eventoOP.create({
    data: {
      id: crypto.randomUUID(),
      opId,
      etapa: 'montagem',
      tipo: 'consumo_subproduto',
      funcionarioId
    }
  });

  return res.json({ ok: true, subproduto });
};

module.exports = {
  consumirSubproduto
};
