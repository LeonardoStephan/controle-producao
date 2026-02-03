const crypto = require('crypto');
const { prisma } = require('../database/prisma');
const { consultarPedidoVenda } = require('../services/omie.service');
const { buscarEtiquetaProdutoFinal } = require('../services/viaOnda.service');

async function viaOndaTemEtiqueta(codProdutoOmie, empresa) {
  const etiquetas = rememberedSafeArray(
    await buscarEtiquetaProdutoFinal(String(codProdutoOmie), empresa)
  );
  return etiquetas.length > 0;
}

function rememberedSafeArray(v) {
  return Array.isArray(v) ? v : [];
}

/* =========================
   INICIAR EXPEDIÇÃO (POR NÚMERO DO PEDIDO)
========================= */
const iniciarExpedicao = async (req, res) => {
  const { numeroPedido, empresa, funcionarioId } = req.body;

  if (!numeroPedido || !empresa || !funcionarioId) {
    return res.status(400).json({
      erro: 'numeroPedido, empresa e funcionarioId são obrigatórios'
    });
  }

  /* =========================
     1️⃣ VALIDA PEDIDO NO OMIE
  ========================= */
  const pedidoOmie = await consultarPedidoVenda(numeroPedido, empresa);

  if (!pedidoOmie || !pedidoOmie.itens || pedidoOmie.itens.length === 0) {
    return res.status(404).json({
      erro: 'Pedido não encontrado ou sem itens no Omie'
    });
  }

  /* =========================
     2️⃣ CRIA EXPEDIÇÃO
  ========================= */
  const expedicao = await prisma.expedicao.create({
    data: {
      id: crypto.randomUUID(),
      numeroPedido,
      funcionarioId,
      status: 'ativa'
    }
  });

  await prisma.eventoExpedicao.create({
    data: {
      id: crypto.randomUUID(),
      expedicaoId: expedicao.id,
      tipo: 'inicio',
      funcionarioId
    }
  });

  return res.json({
    ok: true,
    expedicaoId: expedicao.id,
    pedido: {
      numeroPedido,
      cliente: pedidoOmie.cliente,
      itens: pedidoOmie.itens
    }
  });
};

module.exports = {
  iniciarExpedicao
};


/* =========================
   SCAN DE PRODUTO / SÉRIE
========================= */
const scanSerie = async (req, res) => {
  const { id } = req.params;
  const { empresa, codProdutoOmie, serie } = req.body;

  if (!empresa || !codProdutoOmie) {
    return res.status(400).json({
      erro: 'empresa e codProdutoOmie são obrigatórios'
    });
  }

  const expedicao = await prisma.expedicao.findUnique({
    where: { id },
    include: { series: true }
  });

  if (!expedicao || expedicao.status !== 'ativa') {
    return res.status(400).json({
      erro: 'Expedição inválida ou não ativa'
    });
  }

  /* =========================
     PEDIDO (OMIE)
  ========================= */
  const pedidoOmie = await consultarPedidoVenda(
    expedicao.numeroPedido,
    empresa
  );

  if (!pedidoOmie || !pedidoOmie.itens?.length) {
    return res.status(404).json({
      erro: 'Pedido não encontrado ou sem itens no Omie'
    });
  }

  const itemPedido = pedidoOmie.itens.find(
    i => i.codProdutoOmie === codProdutoOmie
  );

  if (!itemPedido) {
    return res.status(400).json({
      erro: 'Produto não pertence ao pedido'
    });
  }

  /* =========================
     CONTROLE DE QUANTIDADE
  ========================= */
  const qtdEscaneada = expedicao.series.filter(
    s => s.codProdutoOmie === codProdutoOmie
  ).length;

  if (qtdEscaneada >= itemPedido.quantidade) {
    return res.status(400).json({
      erro: `Quantidade máxima atingida para ${codProdutoOmie}`
    });
  }

  /* =====================================================
     🔑 REGRA CORRETA:
     ─ Se NÃO veio série → produto SEM série (quantidade)
     ─ Se VEIO série → validar série
  ===================================================== */

  /* =========================
     PRODUTO SEM SÉRIE
  ========================= */
  if (!serie) {
    const vinculo = await prisma.expedicaoSerie.create({
      data: {
        id: crypto.randomUUID(),
        expedicaoId: id,
        codProdutoOmie,
        produtoFinalId: null,
        serie: null
      }
    });

    return res.json({
      ok: true,
      tipo: 'quantidade',
      vinculo
    });
  }

  /* =========================
     PRODUTO COM SÉRIE
  ========================= */

  /* 🔒 BLOQUEIO GLOBAL ABSOLUTO */
  const serieJaExiste = await prisma.expedicaoSerie.findFirst({
    where: { serie }
  });

  if (serieJaExiste) {
    return res.status(400).json({
      erro: `Série ${serie} já foi utilizada no sistema`
    });
  }

  /* 🔹 Série precisa existir como produto final */
  const produtoFinal = await prisma.produtoFinal.findUnique({
    where: { serie }
  });

  if (!produtoFinal) {
    return res.status(404).json({
      erro: 'Série não encontrada no cadastro de produtos'
    });
  }

  /* 🔒 Série NÃO pode ser usada em outro produto */
  if (produtoFinal.codProdutoOmie !== codProdutoOmie) {
    return res.status(400).json({
      erro: 'Série não pertence a este produto'
    });
  }

  /* =========================
     ESTOQUE PADRÃO
  ========================= */
  const estoque = await consultarEstoquePadrao(
    codProdutoOmie,
    empresa
  );

  if (!estoque || estoque.nSaldo <= 0) {
    return res.status(400).json({
      erro: 'Produto sem saldo no estoque padrão'
    });
  }

  /* =========================
     VÍNCULO FINAL
  ========================= */
  const vinculo = await prisma.expedicaoSerie.create({
    data: {
      id: crypto.randomUUID(),
      expedicaoId: id,
      codProdutoOmie,
      produtoFinalId: produtoFinal.id,
      serie
    }
  });

  return res.json({
    ok: true,
    tipo: 'serie',
    vinculo
  });
};

/* =========================
   UPLOAD DE FOTO
========================= */
const uploadFotoSerie = async (req, res) => {
  const { id } = req.params;
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ erro: 'URL obrigatória' });
  }

  const foto = await prisma.fotoExpedicao.create({
    data: {
      id: crypto.randomUUID(),
      expedicaoSerieId: id,
      url
    }
  });

  return res.json({ ok: true, foto });
};

/* =========================
   FINALIZAR EXPEDIÇÃO
========================= */
const finalizarExpedicao = async (req, res) => {
  const { id } = req.params;
  const { funcionarioId, empresa } = req.body;

  if (!funcionarioId || !empresa) {
    return res.status(400).json({
      erro: 'funcionarioId e empresa são obrigatórios'
    });
  }

  const expedicao = await prisma.expedicao.findUnique({
    where: { id },
    include: { series: true }
  });

  if (!expedicao || expedicao.status !== 'ativa') {
    return res.status(400).json({ erro: 'Expedição inválida' });
  }

  /* =========================
     PEDIDO DE VENDA (OMIE)
  ========================= */
  const pedidoOmie = await consultarPedidoVenda(
    expedicao.numeroPedido,
    empresa
  );

  if (!pedidoOmie || !Array.isArray(pedidoOmie.itens)) {
    return res.status(502).json({
      erro: 'Falha ao consultar pedido de venda no Omie'
    });
  }

  /* =========================
     VALIDAÇÃO CORRETA
     (só produtos COM série)
  ========================= */
  for (const item of pedidoOmie.itens) {
    const possuiSerie = await viaOndaTemEtiqueta(
      item.codProdutoOmie,
      empresa
    );

    // 👉 Produto SEM número de série → ignora validação
    if (!possuiSerie) continue;

    const qtdEscaneada = expedicao.series.filter(
      s => s.codProdutoOmie === item.codProdutoOmie
    ).length;

    if (qtdEscaneada < item.quantidade) {
      return res.status(400).json({
        erro: `Produto ${item.codProdutoOmie} incompleto (${qtdEscaneada}/${item.quantidade})`
      });
    }
  }

  /* =========================
     FINALIZA EXPEDIÇÃO
  ========================= */
  await prisma.eventoExpedicao.create({
    data: {
      id: crypto.randomUUID(),
      expedicaoId: id,
      tipo: 'fim',
      funcionarioId
    }
  });

  await prisma.expedicao.update({
    where: { id },
    data: {
      status: 'finalizada',
      finalizadoEm: new Date()
    }
  });

  return res.json({ ok: true });
};

/* =========================
   RESUMO
========================= */
const resumoExpedicao = async (req, res) => {
  const { id } = req.params;

  const expedicao = await prisma.expedicao.findUnique({
    where: { id },
    include: {
      eventos: {
        orderBy: { criadoEm: 'asc' }
      },
      series: {
        include: { fotos: true }
      }
    }
  });

  if (!expedicao) {
    return res.status(404).json({ erro: 'Expedição não encontrada' });
  }

  /* =========================
     AGRUPA ITENS POR PRODUTO
  ========================= */
  const itensMap = {};

  for (const s of expedicao.series) {
    const codigo = s.codProdutoOmie;

    if (!itensMap[codigo]) {
      itensMap[codigo] = {
        codProdutoOmie: codigo,
        tipo: s.serie ? 'serie' : 'quantidade',
        quantidade: 0,
        series: [],
        fotos: []
      };
    }

    // 🔹 Produto COM série
    if (s.serie) {
      itensMap[codigo].series.push(s.serie);
      itensMap[codigo].quantidade += 1;
    }
    // 🔹 Produto SEM série
    else {
      itensMap[codigo].quantidade += 1;
    }

    // 🔹 Fotos (se houver)
    if (s.fotos?.length) {
      itensMap[codigo].fotos.push(...s.fotos);
    }
  }

  const itens = Object.values(itensMap);

  return res.json({
    expedicao: {
      id: expedicao.id,
      numeroPedido: expedicao.numeroPedido,
      status: expedicao.status,
      iniciadoEm: expedicao.iniciadoEm,
      finalizadoEm: expedicao.finalizadoEm,

      eventos: expedicao.eventos.map(e => ({
        tipo: e.tipo,
        funcionarioId: e.funcionarioId,
        criadoEm: e.criadoEm
      })),

      itens
    }
  });
};

module.exports = {
  iniciarExpedicao,
  scanSerie,
  uploadFotoSerie,
  finalizarExpedicao,
  resumoExpedicao
};
