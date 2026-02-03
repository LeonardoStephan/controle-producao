const crypto = require('crypto');
const { prisma } = require('../database/prisma');
const axios = require('axios');
const { getOmieCredenciais } = require('../config/omie.config');

// Cache simples em memória para BOM por produto (5 min)
const bomCache = new Map();
const CACHE_TEMPO = 5 * 60 * 1000;

/* =========================
   Valida peça no BOM Omie (ConsultarEstrutura)
   - compara por CÓDIGO: item.codProdMalha === codigoPeca
   - usa cache por (empresa + codProdutoOmie)
========================= */
async function validarPecaNoBOM(codigoPeca, codProdutoOmie, empresa) {
  // Se não temos o código do produto final, não dá pra validar BOM com segurança.
  // Então não bloqueia (mesma ideia do seu subproduto.controller: validação opcional).
  if (!codProdutoOmie) return true;

  const cacheKey = `${empresa}_${codProdutoOmie}`;
  const cache = bomCache.get(cacheKey);

  if (cache && Date.now() - cache.timestamp < CACHE_TEMPO) {
    return cache.itens.some(item => item.codProdMalha === codigoPeca);
  }

  const { appKey, appSecret } = getOmieCredenciais(empresa);

  try {
    const response = await axios.post(
      'https://app.omie.com.br/api/v1/geral/malha/',
      {
        call: 'ConsultarEstrutura',
        param: [{ codProduto: codProdutoOmie }],
        app_key: appKey,
        app_secret: appSecret
      },
      { timeout: 40000 }
    );

    const bom = response.data?.itens || [];
    bomCache.set(cacheKey, { itens: bom, timestamp: Date.now() });

    return bom.some(item => item.codProdMalha === codigoPeca);
  } catch (err) {
    console.error('Erro ao consultar BOM Omie (ConsultarEstrutura):', err.response?.data || err.message);
    // Se Omie falhar, melhor retornar erro 502 em vez de bloquear sem motivo.
    throw new Error('FALHA_AO_VALIDAR_BOM_OMIE');
  }
}

/* =========================
   CONSUMO DE PEÇA
   - exige: codigoPeca, qrCode, funcionarioId, empresa
   - exige contexto: subprodutoId OU produtoFinalId (um dos dois)
   - valida: etapa montagem + montagem ativa + QR não duplicado + BOM (se houver codProdutoOmie)
========================= */
const consumirPeca = async (req, res) => {
  const {
    codigoPeca,
    qrCode,
    funcionarioId,
    subprodutoId,
    produtoFinalId,
    empresa
  } = req.body;

  // 1) Validações básicas
  if (!codigoPeca || !qrCode || !funcionarioId || !empresa) {
    return res.status(400).json({ erro: 'Dados obrigatórios ausentes' });
  }

  // 2) Exigir exatamente UM contexto (subprodutoId OU produtoFinalId)
  if ((!subprodutoId && !produtoFinalId) || (subprodutoId && produtoFinalId)) {
    return res.status(400).json({ erro: 'Informe apenas subprodutoId OU produtoFinalId' });
  }

  try {
    let opId;
    let codProdutoOmie = null;

    // 3) Resolver contexto → OP + codProdutoOmie
    if (produtoFinalId) {
      const produtoFinal = await prisma.produtoFinal.findUnique({
        where: { id: produtoFinalId },
        include: { ordemProducao: true }
      });

      if (!produtoFinal) {
        return res.status(404).json({ erro: 'Produto final não encontrado' });
      }

      opId = produtoFinal.opId;
      codProdutoOmie = produtoFinal.codProdutoOmie || null;

      if (produtoFinal.ordemProducao?.status !== 'montagem') {
        return res.status(400).json({ erro: 'Consumo permitido apenas na etapa de montagem' });
      }
    }

    if (subprodutoId) {
      const subproduto = await prisma.subproduto.findUnique({
        where: { id: subprodutoId },
        include: {
          produtoFinal: { include: { ordemProducao: true } }
        }
      });

      if (!subproduto) {
        return res.status(404).json({ erro: 'Subproduto não encontrado' });
      }

      // Aqui depende do seu schema: em alguns projetos subproduto tem opId direto.
      // No seu schema do zip, subproduto tem opId, e também produtoFinalId opcional.
      opId = subproduto.opId || subproduto.produtoFinal?.opId;

      codProdutoOmie = subproduto.produtoFinal?.codProdutoOmie || null;

      if (subproduto.produtoFinal?.ordemProducao?.status !== 'montagem') {
        return res.status(400).json({ erro: 'Consumo permitido apenas na etapa de montagem' });
      }
    }

    if (!opId) {
      return res.status(400).json({ erro: 'Não foi possível determinar a OP do contexto informado' });
    }

    // 4) Montagem precisa estar ativa (não pausada, não finalizada)
    const ultimoEvento = await prisma.eventoOP.findFirst({
      where: { opId, etapa: 'montagem' },
      orderBy: { criadoEm: 'desc' }
    });

    if (!ultimoEvento || ['pausa', 'fim'].includes(ultimoEvento.tipo)) {
      return res.status(400).json({ erro: 'Montagem não está ativa' });
    }

    // 5) QR não reutilizável (pré-check)
    const qrAtivo = await prisma.consumoPeca.findFirst({
      where: { qrCode, fimEm: null }
    });

    if (qrAtivo) {
      return res.status(400).json({ erro: 'Este QR Code já está vinculado' });
    }

    // 6) Valida BOM (se possível)
    const valido = await validarPecaNoBOM(codigoPeca, codProdutoOmie, empresa);

    if (!valido) {
      return res.status(400).json({ erro: 'Peça não pertence ao BOM do produto final' });
    }

    // 7) Transação para blindar concorrência de QR duplicado
    const consumo = await prisma.$transaction(async (tx) => {
      const qrAtivoTx = await tx.consumoPeca.findFirst({
        where: { qrCode, fimEm: null }
      });

      if (qrAtivoTx) {
        const e = new Error('QR_JA_UTILIZADO');
        e.code = 'QR_JA_UTILIZADO';
        throw e;
      }

      return tx.consumoPeca.create({
        data: {
          id: crypto.randomUUID(),
          codigoPeca,
          qrCode,
          funcionarioId,
          subprodutoId: subprodutoId || null,
          produtoFinalId: produtoFinalId || null
        }
      });
    });

    return res.json({ ok: true, consumo });
  } catch (err) {
    if (err.code === 'QR_JA_UTILIZADO') {
      return res.status(400).json({ erro: 'Este QR Code já está vinculado' });
    }

    if (err.message === 'FALHA_AO_VALIDAR_BOM_OMIE') {
      return res.status(502).json({ erro: 'Falha ao validar BOM no Omie' });
    }

    console.error('Erro ao consumirPeca:', err);
    return res.status(500).json({ erro: 'Erro interno ao consumir peça' });
  }
};

/* =========================
   SUBSTITUIÇÃO DE PEÇA
========================= */
const substituirPeca = async (req, res) => {
  const { consumoPecaId, novoQrCode, funcionarioId } = req.body;

  if (!consumoPecaId || !novoQrCode || !funcionarioId) {
    return res.status(400).json({ erro: 'Dados obrigatórios ausentes' });
  }

  try {
    const consumoAtual = await prisma.consumoPeca.findUnique({
      where: { id: consumoPecaId }
    });

    if (!consumoAtual || consumoAtual.fimEm) {
      return res.status(404).json({ erro: 'Consumo ativo não encontrado' });
    }

    const qrAtivo = await prisma.consumoPeca.findFirst({
      where: { qrCode: novoQrCode, fimEm: null }
    });

    if (qrAtivo) {
      return res.status(400).json({ erro: 'Novo QR Code já está vinculado' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.consumoPeca.update({
        where: { id: consumoPecaId },
        data: { fimEm: new Date() }
      });

      await tx.consumoPeca.create({
        data: {
          id: crypto.randomUUID(),
          codigoPeca: consumoAtual.codigoPeca,
          qrCode: novoQrCode,
          funcionarioId,
          subprodutoId: consumoAtual.subprodutoId,
          produtoFinalId: consumoAtual.produtoFinalId
        }
      });
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao substituirPeca:', err);
    return res.status(500).json({ erro: 'Erro interno ao substituir peça' });
  }
};

/* =========================
   HISTÓRICO DE PEÇAS
========================= */
const historicoPecas = async (req, res) => {
  const { subprodutoId, produtoFinalId } = req.query;

  if ((!subprodutoId && !produtoFinalId) || (subprodutoId && produtoFinalId)) {
    return res.status(400).json({ erro: 'Informe apenas subprodutoId OU produtoFinalId' });
  }

  const consumos = await prisma.consumoPeca.findMany({
    where: {
      subprodutoId: subprodutoId || undefined,
      produtoFinalId: produtoFinalId || undefined
    },
    orderBy: { inicioEm: 'asc' }
  });

  return res.json({ consumos });
};

module.exports = {
  consumirPeca,
  substituirPeca,
  historicoPecas
};
