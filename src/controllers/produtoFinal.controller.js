// src/controllers/produtoFinal.controller.js
const crypto = require('crypto');
const axios = require('axios');
const { prisma } = require('../database/prisma');
const { buscarEtiquetaProdutoFinal } = require('../services/viaOnda.service');
const { getOmieCredenciais } = require('../config/omie.config');

/* =========================
   Valida produto no Omie
========================= */
async function validarProdutoNoOmie(codProdutoOmie, empresa) {
  const codigo = String(codProdutoOmie || '').trim();
  if (!codigo) return false;

  const { appKey, appSecret } = getOmieCredenciais(empresa);

  try {
    const resp = await axios.post(
      'https://app.omie.com.br/api/v1/geral/produtos/',
      {
        call: 'ConsultarProduto',
        param: [{ codigo }],
        app_key: appKey,
        app_secret: appSecret
      },
      { timeout: 40000 }
    );

    const data = resp.data || {};
    if (String(data.codigo || '').trim() === codigo) return true;
    if (data.codigo_produto) return true;
    if (data.faultstring || data.faultcode) return false;

    return false;
  } catch (err) {
    const payload = err.response?.data;
    if (payload?.faultstring || payload?.faultcode) return false;

    const e = new Error('FALHA_OMIE');
    e.detail = payload || err.message;
    throw e;
  }
}

/* =========================
   CRIAR PRODUTO FINAL
========================= */
const criarProdutoFinal = async (req, res) => {
  const { opId, serieProdutoFinal, empresa, codProdutoOmie } = req.body;

  // 🔒 escolha de regra:
  // true  => obriga codProdutoOmie quando criar PF
  // false => deixa opcional (mas se informar, valida)
  const STRICT_COD_PRODUTO = true;

  if (!opId || !serieProdutoFinal) {
    return res.status(400).json({ erro: 'opId e serieProdutoFinal são obrigatórios' });
  }

  const op = await prisma.ordemProducao.findUnique({
    where: { id: String(opId) }
  });
  if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

  const empresaFinal = String(op.empresa || empresa || '').trim();
  if (!empresaFinal) {
    return res.status(400).json({ erro: 'empresa é obrigatória (salve empresa na OP ou envie no body)' });
  }

  const serie = String(serieProdutoFinal).trim();
  const codProduto = codProdutoOmie ? String(codProdutoOmie).trim() : null;

  // ✅ 1) trava de coerência por OP:
  // se já existe PF na OP com codProdutoOmie, força ser o mesmo
  const pfExistenteDaOp = await prisma.produtoFinal.findFirst({
    where: { opId: String(opId), codProdutoOmie: { not: null } },
    select: { codProdutoOmie: true }
  });

  if (pfExistenteDaOp?.codProdutoOmie) {
    if (!codProduto) {
      return res.status(400).json({
        erro: `Esta OP já está vinculada ao produto Omie '${pfExistenteDaOp.codProdutoOmie}'. Envie codProdutoOmie no body.`
      });
    }

    if (String(pfExistenteDaOp.codProdutoOmie).trim() !== codProduto) {
      return res.status(400).json({
        erro: `codProdutoOmie diferente do padrão da OP. Esta OP está vinculada a '${pfExistenteDaOp.codProdutoOmie}'.`
      });
    }
  } else {
    // ✅ 2) se ainda não tem padrão, você escolhe se é obrigatório
    if (STRICT_COD_PRODUTO && !codProduto) {
      return res.status(400).json({
        erro: 'codProdutoOmie é obrigatório para criar Produto Final'
      });
    }
  }

  // 3) Impede duplicação de série
  const jaExiste = await prisma.produtoFinal.findUnique({ where: { serie } });
  if (jaExiste) return res.status(400).json({ erro: 'Produto final já registrado com esta série' });

  // 4) Valida série na ViaOnda
  const etiquetas = await buscarEtiquetaProdutoFinal(op.numeroOP, empresaFinal);
  const pertence =
    Array.isArray(etiquetas) &&
    etiquetas.some(e => String(e.serie).trim() === serie);

  if (!pertence) {
    return res.status(400).json({ erro: 'Série não pertence à OP ou não foi impressa' });
  }

  // 5) Valida codProdutoOmie no Omie (se veio)
  if (codProduto) {
    try {
      const okOmie = await validarProdutoNoOmie(codProduto, empresaFinal);
      if (!okOmie) {
        return res.status(400).json({
          erro: 'codProdutoOmie inválido: produto não encontrado no Omie'
        });
      }
    } catch (e) {
      console.error('Erro validarProdutoNoOmie:', e.detail || e.message);
      return res.status(502).json({ erro: 'Falha ao consultar produto no Omie' });
    }
  }

  // 6) Cria PF
  const produtoFinal = await prisma.produtoFinal.create({
    data: {
      id: crypto.randomUUID(),
      opId: String(opId),
      serie,
      codProdutoOmie: codProduto
    }
  });

  return res.json({ ok: true, produtoFinal });
};

module.exports = { criarProdutoFinal };
