// src/controllers/subproduto.controller.js
const crypto = require('crypto');
const { prisma } = require('../database/prisma');
const { buscarEtiquetaProdutoFinal, buscarOP } = require('../services/viaOnda.service');
const axios = require('axios');
const { getOmieCredenciais } = require('../config/omie.config');

/* =========================
   Cache simples BOM Omie
========================= */
const bomCache = new Map();
const CACHE_TEMPO = 5 * 60 * 1000;

/* =========================
   Extrai código do QR (fallback)
========================= */
function extrairCodigoDoQr(qr) {
  if (!qr || typeof qr !== 'string') return null;
  const partes = qr.split(';').map(p => p.trim()).filter(Boolean);
  return partes[1] || null;
}

/* =========================
   Busca BOM do produto (ConsultarEstrutura)
========================= */
async function consultarEstrutura(codProdutoOmie, empresa) {
  if (!codProdutoOmie) return null;

  const { appKey, appSecret } = getOmieCredenciais(empresa);

  const cacheKey = `${empresa}_${codProdutoOmie}`;
  const cache = bomCache.get(cacheKey);

  if (cache && Date.now() - cache.timestamp < CACHE_TEMPO) {
    return cache.data;
  }

  const resp = await axios.post(
    'https://app.omie.com.br/api/v1/geral/malha/',
    {
      call: 'ConsultarEstrutura',
      param: [{ codProduto: codProdutoOmie }],
      app_key: appKey,
      app_secret: appSecret
    },
    { timeout: 40000 }
  );

  const data = resp.data || {};
  bomCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

/* =========================
   Extrai SubProdutos do BOM
   descrFamMalha === "SubProduto"
========================= */
function extrairSubprodutosDoBOM(bomData) {
  const itens = Array.isArray(bomData?.itens) ? bomData.itens : [];

  return itens
    .filter(i => String(i.descrFamMalha || '').trim() === 'SubProduto')
    .map(i => ({
      codigo: String(i.codProdMalha || '').trim(),
      qtdPorUnidade: Number(i.quantProdMalha || 0)
    }))
    .filter(i => i.codigo && i.qtdPorUnidade > 0);
}

/* =========================================================
   ✅ CORRIGIDO: valida se um código de produto existe no OMIE
   - endpoint correto: /geral/produtos/
   - param correto: { codigo: "..." }
========================================================= */
async function validarProdutoExisteNoOmie(codProduto, empresa) {
  const cod = String(codProduto || '').trim();
  if (!cod) return false;

  const { appKey, appSecret } = getOmieCredenciais(empresa);

  try {
    const resp = await axios.post(
      'https://app.omie.com.br/api/v1/geral/produtos/',
      {
        call: 'ConsultarProduto',
        param: [{ codigo: cod }],
        app_key: appKey,
        app_secret: appSecret
      },
      { timeout: 40000 }
    );

    // se retornou um objeto, consideramos que existe
    return !!resp.data;
  } catch (err) {
    const data = err.response?.data;

    // Omie geralmente devolve erro no JSON (faultstring / error.status_code)
    const fault = String(data?.faultstring || '').toLowerCase();
    const statusCode = data?.error?.status_code;

    // “não encontrado” -> produto inválido (não explode)
    if (statusCode === 404) return false;
    if (fault.includes('not found')) return false;
    if (fault.includes('não encontrado') || fault.includes('nao encontrado')) return false;
    if (fault.includes('inexistente') || fault.includes('não existe') || fault.includes('nao existe')) return false;

    console.error('Erro ConsultarProduto (Omie):', data || err.message);
    const e = new Error('FALHA_OMIE_CONSULTAR_PRODUTO');
    throw e;
  }
}

/* =========================================================
   helper: valida codigoSubproduto no Omie e responde no padrão
========================================================= */
async function exigirCodigoSubprodutoValidoNoOmie(codigoSubproduto, empresaResolvida, res) {
  try {
    const ok = await validarProdutoExisteNoOmie(codigoSubproduto, empresaResolvida);
    if (!ok) {
      res.status(400).json({ erro: 'codigoSubproduto inválido: produto não encontrado no Omie' });
      return false;
    }
    return true;
  } catch (err) {
    if (err.message === 'FALHA_OMIE_CONSULTAR_PRODUTO') {
      res.status(502).json({ erro: 'Falha ao validar produto no Omie' });
      return false;
    }
    console.error('Erro ao validar codigoSubproduto no Omie:', err);
    res.status(500).json({ erro: 'Erro interno ao validar codigoSubproduto' });
    return false;
  }
}

/* =========================================================
   ✅ extrai o código do produto da OP na etiquetadora
========================================================= */
function extrairCodigoProdutoDaOpViaOnda(item) {
  const codigo = item?.codigo ? String(item.codigo).trim() : null;
  return codigo || null;
}

/* ============================================================
   ✅ REGISTRAR SUBPRODUTO (PRODUÇÃO)
============================================================ */
const registrarSubproduto = async (req, res) => {
  const {
    opId,
    opNumeroSubproduto,
    serie,
    funcionarioId,
    quantidade = 1,
    codigoSubproduto,
    qrCode,
    empresa
  } = req.body;

  if (!opId || !serie || !funcionarioId) {
    return res.status(400).json({ erro: 'opId, serie e funcionarioId são obrigatórios' });
  }

  const op = await prisma.ordemProducao.findUnique({ where: { id: String(opId) } });
  if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

  const empresaResolvida = String(op.empresa || empresa || '').trim();
  if (!empresaResolvida) {
    return res.status(400).json({
      erro: 'Empresa não definida. Salve empresa na OP (op.empresa) ou envie "empresa" no body.'
    });
  }

  if (op.status !== 'montagem') {
    return res.status(400).json({
      erro: `Registro de subproduto permitido apenas na etapa de montagem. Status atual: ${op.status}`
    });
  }

  const ultimoEvento = await prisma.eventoOP.findFirst({
    where: { opId: String(opId), etapa: 'montagem' },
    orderBy: { criadoEm: 'desc' }
  });

  if (!ultimoEvento || ['pausa', 'fim'].includes(ultimoEvento.tipo)) {
    return res.status(400).json({ erro: 'Montagem não está ativa' });
  }

  const serieNorm = String(serie).trim();

  const existente = await prisma.subproduto.findUnique({
    where: { etiquetaId: serieNorm }
  });

  if (existente) {
    if (!existente.produtoFinalId) {
      return res.status(200).json({
        ok: true,
        aviso: 'Subproduto já estava registrado (produção).',
        subproduto: existente
      });
    }
    return res.status(400).json({ erro: 'Etiqueta de subproduto já utilizada' });
  }

  const opNumero = String(opNumeroSubproduto || op.numeroOP || '').trim();
  if (!opNumero) {
    return res.status(400).json({ erro: 'opNumeroSubproduto é obrigatório (ou OP precisa ter numeroOP)' });
  }

  const etiquetas = await buscarEtiquetaProdutoFinal(opNumero, empresaResolvida);
  if (!Array.isArray(etiquetas) || etiquetas.length === 0) {
    return res.status(400).json({ erro: 'OP de subproduto não encontrada na ViaOnda' });
  }

  const pertence = etiquetas.some(e => String(e.serie || '').trim() === serieNorm);
  if (!pertence) {
    return res.status(400).json({ erro: 'Etiqueta não pertence à OP do subproduto' });
  }

  const codigoDetectado =
    (codigoSubproduto && String(codigoSubproduto).trim()) ||
    (qrCode ? extrairCodigoDoQr(qrCode) : null);

  if (!codigoDetectado) {
    return res.status(400).json({
      erro: 'Não foi possível identificar o código do subproduto. Envie "codigoSubproduto".'
    });
  }

  // ✅ valida codigoSubproduto no Omie
  const okCodigo = await exigirCodigoSubprodutoValidoNoOmie(codigoDetectado, empresaResolvida, res);
  if (!okCodigo) return;

  const subproduto = await prisma.subproduto.create({
    data: {
      id: crypto.randomUUID(),
      opId: String(opId),
      produtoFinalId: null,
      opNumeroSubproduto: opNumero,
      etiquetaId: serieNorm,
      funcionarioId: String(funcionarioId),
      quantidade: Number(quantidade || 1),
      codigoSubproduto: String(codigoDetectado).trim()
    }
  });

  await prisma.eventoOP.create({
    data: {
      id: crypto.randomUUID(),
      opId: String(opId),
      etapa: 'montagem',
      tipo: 'registro_subproduto',
      funcionarioId: String(funcionarioId)
    }
  });

  return res.json({ ok: true, subproduto });
};

/* =========================
   CONSUMO DE SUBPRODUTO (NO PRODUTO FINAL)
   ✅ MELHORIA: paraleliza chamadas ViaOnda (buscarEtiquetaProdutoFinal + buscarOP)
========================= */
const consumirSubproduto = async (req, res) => {
  const {
    opId,
    produtoFinalId,
    opNumeroSubproduto,
    serie,
    funcionarioId,
    quantidade = 1,

    codigoSubproduto,
    qrCode,

    codProdutoOmie,
    empresa
  } = req.body;

  if (!opId || !produtoFinalId || !opNumeroSubproduto || !serie || !funcionarioId) {
    return res.status(400).json({
      erro: 'opId, produtoFinalId, opNumeroSubproduto, serie e funcionarioId são obrigatórios'
    });
  }

  const op = await prisma.ordemProducao.findUnique({ where: { id: String(opId) } });
  if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

  const empresaResolvida = String(op.empresa || empresa || '').trim();
  if (!empresaResolvida) {
    return res.status(400).json({
      erro: 'Empresa não definida. Salve empresa na OP (op.empresa) ou envie "empresa" no body.'
    });
  }

  if (op.status !== 'montagem') {
    return res.status(400).json({ erro: 'Consumo de subproduto permitido apenas na montagem' });
  }

  const ultimoEvento = await prisma.eventoOP.findFirst({
    where: { opId: String(opId), etapa: 'montagem' },
    orderBy: { criadoEm: 'desc' }
  });

  if (!ultimoEvento || ['pausa', 'fim'].includes(ultimoEvento.tipo)) {
    return res.status(400).json({ erro: 'Montagem não está ativa' });
  }

  const pf = await prisma.produtoFinal.findUnique({
    where: { id: String(produtoFinalId) },
    select: { id: true, opId: true, codProdutoOmie: true }
  });

  if (!pf) return res.status(404).json({ erro: 'Produto final não encontrado' });
  if (String(pf.opId) !== String(opId)) {
    return res.status(400).json({ erro: 'Produto final não pertence à OP informada' });
  }

  const serieNorm = String(serie).trim();

  const codigoDetectado =
    (codigoSubproduto && String(codigoSubproduto).trim()) ||
    (qrCode ? extrairCodigoDoQr(qrCode) : null);

  if (!codigoDetectado) {
    return res.status(400).json({
      erro: 'Não foi possível identificar o código do subproduto. Envie "codigoSubproduto".'
    });
  }

  // ✅ trava: não permitir mais de 1 etiqueta (nº série) do MESMO codigoSubproduto no mesmo produto final
  const jaExisteMesmoCodigoNoMesmoPF = await prisma.subproduto.findFirst({
    where: {
      produtoFinalId: String(produtoFinalId),
      codigoSubproduto: String(codigoDetectado).trim(),
      etiquetaId: { not: serieNorm }
    },
    select: { id: true, etiquetaId: true, codigoSubproduto: true }
  });

  if (jaExisteMesmoCodigoNoMesmoPF) {
    return res.status(400).json({
      erro: `Já existe um subproduto do tipo ${String(codigoDetectado).trim()} vinculado a este produto final (série já usada: ${jaExisteMesmoCodigoNoMesmoPF.etiquetaId}).`
    });
  }

  /* =========================================================
     ✅ Paralelismo ViaOnda:
     - buscarEtiquetaProdutoFinal (valida se a série pertence à OP)
     - buscarOP (descobre o "codigo" correto da OP)
  ========================================================= */
  let etiquetas, dadosOpSub;
  try {
    [etiquetas, dadosOpSub] = await Promise.all([
      buscarEtiquetaProdutoFinal(String(opNumeroSubproduto).trim(), empresaResolvida),
      buscarOP(String(opNumeroSubproduto).trim(), empresaResolvida)
    ]);
  } catch (err) {
    console.error('Erro ao consultar ViaOnda (paralelo):', err?.message || err);
    return res.status(502).json({ erro: 'Falha ao consultar etiquetadora (ViaOnda)' });
  }

  if (!Array.isArray(etiquetas) || etiquetas.length === 0) {
    return res.status(400).json({ erro: 'OP de subproduto não encontrada na ViaOnda' });
  }

  const pertence = etiquetas.some(e => String(e.serie || '').trim() === serieNorm);
  if (!pertence) {
    return res.status(400).json({ erro: 'Etiqueta não pertence à OP do subproduto' });
  }

  if (!Array.isArray(dadosOpSub) || dadosOpSub.length === 0) {
    return res.status(400).json({
      erro: `OP do subproduto ${opNumeroSubproduto} não encontrada na etiquetadora`
    });
  }

  const codigoEsperado = extrairCodigoProdutoDaOpViaOnda(dadosOpSub[0]);
  if (!codigoEsperado) {
    return res.status(502).json({
      erro: `A etiquetadora não retornou o campo "codigo" para a OP ${opNumeroSubproduto}`
    });
  }

  if (String(codigoDetectado).trim() !== codigoEsperado) {
    return res.status(400).json({
      erro: `codigoSubproduto inválido para a OP ${opNumeroSubproduto}. Esperado: ${codigoEsperado}`
    });
  }

  // ✅ valida codigoSubproduto no Omie (agora já garantido que é o correto da OP)
  const okCodigo = await exigirCodigoSubprodutoValidoNoOmie(codigoDetectado, empresaResolvida, res);
  if (!okCodigo) return;

  // resolve codProdutoOmieFinal para validar BOM do produto final
  let codProdutoOmieFinal = pf.codProdutoOmie ? String(pf.codProdutoOmie).trim() : null;

  if (!codProdutoOmieFinal) {
    const pfPadrao = await prisma.produtoFinal.findFirst({
      where: { opId: String(opId), codProdutoOmie: { not: null } },
      select: { codProdutoOmie: true }
    });
    if (pfPadrao?.codProdutoOmie) codProdutoOmieFinal = String(pfPadrao.codProdutoOmie).trim();
  }

  if (!codProdutoOmieFinal && codProdutoOmie) {
    codProdutoOmieFinal = String(codProdutoOmie).trim();
  }

  // valida BOM se existir codProdutoOmieFinal e houver família SubProduto
  if (codProdutoOmieFinal) {
    let bomData;
    try {
      bomData = await consultarEstrutura(codProdutoOmieFinal, empresaResolvida);
    } catch (err) {
      console.error('Erro ConsultarEstrutura (subproduto):', err.response?.data || err.message);
      return res.status(502).json({ erro: 'Falha ao consultar BOM no Omie' });
    }

    const subprodutosBOM = extrairSubprodutosDoBOM(bomData);
    if (subprodutosBOM.length > 0) {
      const existeNoBOM = subprodutosBOM.some(sp => sp.codigo === String(codigoDetectado).trim());
      if (!existeNoBOM) {
        return res.status(400).json({
          erro: 'Subproduto não pertence ao BOM do produto (família SubProduto)'
        });
      }
    }
  }

  // vinculação por etiquetaId (inteligente)
  const existente = await prisma.subproduto.findUnique({
    where: { etiquetaId: serieNorm }
  });

  let subproduto;

  if (existente) {
    if (existente.produtoFinalId) {
      return res.status(400).json({ erro: 'Etiqueta de subproduto já utilizada' });
    }

    subproduto = await prisma.subproduto.update({
      where: { etiquetaId: serieNorm },
      data: {
        produtoFinalId: String(produtoFinalId),
        opNumeroSubproduto: String(opNumeroSubproduto),
        funcionarioId: String(funcionarioId),
        quantidade: Number(quantidade || existente.quantidade || 1),
        codigoSubproduto: String(codigoDetectado).trim()
      }
    });
  } else {
    subproduto = await prisma.subproduto.create({
      data: {
        id: crypto.randomUUID(),
        opId: String(opId),
        produtoFinalId: String(produtoFinalId),
        opNumeroSubproduto: String(opNumeroSubproduto),
        etiquetaId: serieNorm,
        funcionarioId: String(funcionarioId),
        quantidade: Number(quantidade || 1),
        codigoSubproduto: String(codigoDetectado).trim()
      }
    });
  }

  await prisma.eventoOP.create({
    data: {
      id: crypto.randomUUID(),
      opId: String(opId),
      etapa: 'montagem',
      tipo: 'consumo_subproduto',
      funcionarioId: String(funcionarioId)
    }
  });

  return res.json({ ok: true, subproduto });
};

module.exports = {
  registrarSubproduto,
  consumirSubproduto
};
