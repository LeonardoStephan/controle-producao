// src/controllers/peca.controller.js
const crypto = require('crypto');
const { prisma } = require('../database/prisma');
const axios = require('axios');
const { getOmieCredenciais } = require('../config/omie.config');

// Cache simples em memória para BOM por produto (5 min)
const bomCache = new Map();
const CACHE_TEMPO = 5 * 60 * 1000;

/* =========================
   Extrai o CÓDIGO da peça do QRCode
   "02/02/2026 07:26:33;CF_MU904;CLIENTE;..."
   -> CF_MU904
========================= */
function extrairCodigoDaPecaDoQr(qrCodeRaw) {
  if (!qrCodeRaw) return null;

  const qr = String(qrCodeRaw).trim();
  const parts = qr.split(';').map(p => p.trim()).filter(Boolean);

  if (parts.length >= 2) return parts[1] || null;

  const tokens = qr.split(/[|,\s]+/).map(t => t.trim()).filter(Boolean);
  return tokens[0] || null;
}

/* =========================
   Valida peça no BOM Omie
========================= */
async function validarPecaNoBOM(codigoPeca, codProdutoOmie, empresa) {
  // Sem codProdutoOmie não dá pra validar BOM -> não bloqueia
  if (!codProdutoOmie) return true;

  const cacheKey = `${empresa}_${codProdutoOmie}`;
  const cache = bomCache.get(cacheKey);

  if (cache && Date.now() - cache.timestamp < CACHE_TEMPO) {
    return cache.itens.some(item =>
      String(item.codProdMalha).trim() === String(codigoPeca).trim()
    );
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

    return bom.some(item =>
      String(item.codProdMalha).trim() === String(codigoPeca).trim()
    );
  } catch (err) {
    console.error(
      'Erro ao consultar BOM Omie (ConsultarEstrutura):',
      err.response?.data || err.message
    );
    throw new Error('FALHA_AO_VALIDAR_BOM_OMIE');
  }
}

/* =========================
   CONSUMO DE PEÇA
   - exige: codigoPeca, qrCode, funcionarioId, empresa
   - exige contexto: subprodutoId OU produtoFinalId (exatamente 1)
   - salva opId (obrigatório no model)
========================= */
const consumirPeca = async (req, res) => {
  const {
    codigoPeca,
    qrCode,
    funcionarioId,
    subprodutoId,
    produtoFinalId,
    empresa,

    // opcional (útil em OP de placa/subproduto quando não há PF associado)
    codProdutoOmie
  } = req.body;

  if (!codigoPeca || !qrCode || !funcionarioId || !empresa) {
    return res.status(400).json({ erro: 'Dados obrigatórios ausentes' });
  }

  if ((!subprodutoId && !produtoFinalId) || (subprodutoId && produtoFinalId)) {
    return res.status(400).json({ erro: 'Informe apenas subprodutoId OU produtoFinalId' });
  }

  const codigoExtraido = extrairCodigoDaPecaDoQr(qrCode);
  if (!codigoExtraido) {
    return res.status(400).json({
      erro: 'QR Code inválido (não foi possível extrair o código da peça)'
    });
  }

  if (String(codigoExtraido).trim() !== String(codigoPeca).trim()) {
    return res.status(400).json({
      erro: `QR Code não corresponde ao código da peça. QR=${codigoExtraido} / codigoPeca=${codigoPeca}`
    });
  }

  try {
    let opIdResolved = null;
    let codProdutoOmieResolved = null;

    // contexto por ProdutoFinal
    if (produtoFinalId) {
      const pf = await prisma.produtoFinal.findUnique({
        where: { id: produtoFinalId }
      });

      if (!pf) return res.status(404).json({ erro: 'Produto final não encontrado' });

      opIdResolved = pf.opId;
      codProdutoOmieResolved = pf.codProdutoOmie || null;
    }

    // contexto por Subproduto
    if (subprodutoId) {
      const sp = await prisma.subproduto.findUnique({
        where: { id: subprodutoId }
      });

      if (!sp) return res.status(404).json({ erro: 'Subproduto não encontrado' });

      opIdResolved = sp.opId || null;

      // se ligado a PF, tenta herdar codProdutoOmie
      if (sp.produtoFinalId) {
        const pf = await prisma.produtoFinal.findUnique({
          where: { id: sp.produtoFinalId }
        });

        codProdutoOmieResolved = pf?.codProdutoOmie || null;
        if (!opIdResolved) opIdResolved = pf?.opId || null;
      }

      // fallback do body (OP de placa)
      if (!codProdutoOmieResolved && codProdutoOmie) {
        codProdutoOmieResolved = String(codProdutoOmie).trim();
      }
    }

    if (!opIdResolved) {
      return res.status(400).json({
        erro: 'Não foi possível determinar a OP do contexto informado'
      });
    }

    const op = await prisma.ordemProducao.findUnique({ where: { id: opIdResolved } });
    if (!op) return res.status(404).json({ erro: 'OP do contexto não encontrada' });

    if (op.status !== 'montagem') {
      return res.status(400).json({
        erro: `Consumo permitido apenas na etapa de montagem. Status atual: ${op.status}`
      });
    }

    const ultimoEvento = await prisma.eventoOP.findFirst({
      where: { opId: opIdResolved, etapa: 'montagem' },
      orderBy: { criadoEm: 'desc' }
    });

    if (!ultimoEvento || ['pausa', 'fim'].includes(ultimoEvento.tipo)) {
      return res.status(400).json({ erro: 'Montagem não está ativa' });
    }

    const qrAtivo = await prisma.consumoPeca.findFirst({
      where: { qrCode: String(qrCode), fimEm: null }
    });

    if (qrAtivo) {
      return res.status(400).json({ erro: 'Este QR Code já está vinculado' });
    }

    const valido = await validarPecaNoBOM(codigoPeca, codProdutoOmieResolved, empresa);
    if (!valido) {
      return res.status(400).json({
        erro: 'Peça não pertence ao BOM do produto',
        detalhe: { codigoPeca, codProdutoOmie: codProdutoOmieResolved || null }
      });
    }

    const consumo = await prisma.$transaction(async (tx) => {
      const qrAtivoTx = await tx.consumoPeca.findFirst({
        where: { qrCode: String(qrCode), fimEm: null }
      });

      if (qrAtivoTx) {
        const e = new Error('QR_JA_UTILIZADO');
        e.code = 'QR_JA_UTILIZADO';
        throw e;
      }

      return tx.consumoPeca.create({
        data: {
          id: crypto.randomUUID(),
          opId: opIdResolved,
          codigoPeca: String(codigoPeca),
          qrCode: String(qrCode),
          funcionarioId: String(funcionarioId),
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

  const codigoExtraidoNovo = extrairCodigoDaPecaDoQr(novoQrCode);
  if (!codigoExtraidoNovo) {
    return res.status(400).json({
      erro: 'Novo QR Code inválido (não foi possível extrair o código da peça)'
    });
  }

  try {
    const consumoAtual = await prisma.consumoPeca.findUnique({
      where: { id: consumoPecaId }
    });

    if (!consumoAtual || consumoAtual.fimEm) {
      return res.status(404).json({ erro: 'Consumo ativo não encontrado' });
    }

    if (String(codigoExtraidoNovo).trim() !== String(consumoAtual.codigoPeca).trim()) {
      return res.status(400).json({
        erro: `Novo QR Code não corresponde ao código da peça. QR=${codigoExtraidoNovo} / codigoPeca=${consumoAtual.codigoPeca}`
      });
    }

    const qrAtivo = await prisma.consumoPeca.findFirst({
      where: { qrCode: String(novoQrCode), fimEm: null }
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
          opId: consumoAtual.opId,
          codigoPeca: consumoAtual.codigoPeca,
          qrCode: String(novoQrCode),
          funcionarioId: String(funcionarioId),
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
  const { subprodutoId, produtoFinalId, opId } = req.query;

  if ((subprodutoId && produtoFinalId)) {
    return res.status(400).json({ erro: 'Informe apenas subprodutoId OU produtoFinalId' });
  }

  try {
    const consumos = await prisma.consumoPeca.findMany({
      where: {
        opId: opId || undefined,
        subprodutoId: subprodutoId || undefined,
        produtoFinalId: produtoFinalId || undefined
      },
      orderBy: { inicioEm: 'asc' }
    });

    return res.json({ consumos });
  } catch (err) {
    console.error('Erro historicoPecas:', err);
    return res.status(500).json({ erro: 'Erro interno ao buscar histórico de peças' });
  }
};

module.exports = {
  consumirPeca,
  substituirPeca,
  historicoPecas
};
