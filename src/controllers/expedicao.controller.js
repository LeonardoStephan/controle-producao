const crypto = require('crypto');
const { prisma } = require('../database/prisma');
const { consultarPedidoVenda, consultarEstoquePadrao } = require('../services/omie.service');

/* =====================================================
   REGRA ROBUSTA:
   Produto "tem série" se existe ProdutoFinal no banco
   com esse codProdutoOmie E com serie preenchida (não null e não vazia).
===================================================== */
async function produtoPossuiSerieNoSistema(codProdutoOmie) {
  const existe = await prisma.produtoFinal.findFirst({
    where: {
      codProdutoOmie: String(codProdutoOmie),
      //serie: { not: '' }  como é String obrigatória, null não entra mesmo
    },
    select: { id: true }
  });
  return !!existe;
}

/* =========================
   INICIAR EXPEDIÇÃO (POR NÚMERO DO PEDIDO)
========================= */
const iniciarExpedicao = async (req, res) => {
  try {
    const { numeroPedido, empresa, funcionarioId } = req.body;

    if (!numeroPedido || !empresa || !funcionarioId) {
      return res.status(400).json({
        erro: 'numeroPedido, empresa e funcionarioId são obrigatórios'
      });
    }

    const pedidoOmie = await consultarPedidoVenda(String(numeroPedido), String(empresa));

    // ✅ não existe / sem itens => 404 e NÃO derruba nada
    if (!pedidoOmie || !Array.isArray(pedidoOmie.itens) || pedidoOmie.itens.length === 0) {
      return res.status(404).json({
        erro: 'Pedido não encontrado ou sem itens no Omie'
      });
    }

    // ✅ impede duplicada ativa
    const jaAtiva = await prisma.expedicao.findFirst({
      where: { numeroPedido: String(numeroPedido), status: 'ativa' },
      select: { id: true }
    });

    if (jaAtiva) {
      return res.status(400).json({
        erro: `Já existe uma expedição ATIVA para este pedido (${numeroPedido}).`,
        expedicaoId: jaAtiva.id
      });
    }

    const expedicao = await prisma.expedicao.create({
      data: {
        id: crypto.randomUUID(),
        numeroPedido: String(numeroPedido),
        empresa: String(empresa),
        funcionarioId: String(funcionarioId),
        status: 'ativa'
      }
    });

    await prisma.eventoExpedicao.create({
      data: {
        id: crypto.randomUUID(),
        expedicaoId: expedicao.id,
        tipo: 'inicio',
        funcionarioId: String(funcionarioId)
      }
    });

    return res.json({
      ok: true,
      expedicaoId: expedicao.id,
      pedido: {
        numeroPedido: pedidoOmie.numeroPedido,
        cliente: pedidoOmie.cliente,
        itens: pedidoOmie.itens
      }
    });
  } catch (err) {
    console.error('Erro iniciarExpedicao:', err.response?.data || err.message);
    return res.status(502).json({
      erro: 'Falha ao consultar pedido no Omie',
      detalhe: err.response?.data || err.message
    });
  }
};


/* =========================
   SCAN DE PRODUTO / SÉRIE
   ✅ NOVA REGRA:
   - Se produto NÃO tem série no sistema:
       - scan é OPCIONAL, NÃO cria registro de "quantidade"
       - se mandar "serie" -> bloqueia
   - Se produto TEM série:
       - exige "serie" e valida normalmente
========================= */
const scanSerie = async (req, res) => {
  try {
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

    const pedidoOmie = await consultarPedidoVenda(expedicao.numeroPedido, empresa);

    if (!pedidoOmie || !Array.isArray(pedidoOmie.itens) || pedidoOmie.itens.length === 0) {
      return res.status(404).json({
        erro: 'Pedido não encontrado ou sem itens no Omie'
      });
    }

    const itemPedido = pedidoOmie.itens.find(i => i.codProdutoOmie === codProdutoOmie);

    if (!itemPedido) {
      return res.status(400).json({
        erro: 'Produto não pertence ao pedido'
      });
    }

    // Decide se "tem série" pelo seu banco (ProdutoFinal)
    const possuiSerie = await produtoPossuiSerieNoSistema(codProdutoOmie);

    // Produto SEM série (no sistema)
    if (!possuiSerie) {
      if (serie) {
        return res.status(400).json({
          erro: `Produto ${codProdutoOmie} NÃO possui número de série no sistema. Para este produto, não envie "serie".`
        });
      }

      // ✅ Não cria registro de quantidade. É opcional.
      // A evidência para itens sem série será feita via FOTO GERAL.
      return res.json({
        ok: true,
        tipo: 'sem_serie',
        mensagem:
          'Produto sem número de série. Não é necessário escanear unidades. Para finalizar, envie ao menos 1 foto geral em /expedicao/fotos-gerais/upload.'
      });
    }

    // Produto COM série
    if (!serie) {
      return res.status(400).json({
        erro: 'Produto exige número de série'
      });
    }

    // Controle de quantidade (com série) — conta só registros com série desse produto
    const qtdComSerie = expedicao.series.filter(
      s => s.codProdutoOmie === codProdutoOmie && s.serie !== null && s.serie !== ''
    ).length;

    if (qtdComSerie >= Number(itemPedido.quantidade)) {
      return res.status(400).json({
        erro: `Quantidade máxima atingida para ${codProdutoOmie}`
      });
    }

    // Bloqueio global absoluto (série única)
    const serieJaExiste = await prisma.expedicaoSerie.findFirst({
      where: { serie: String(serie) }
    });

    if (serieJaExiste) {
      return res.status(400).json({
        erro: `Série ${serie} já foi utilizada no sistema`
      });
    }

    const produtoFinal = await prisma.produtoFinal.findUnique({
      where: { serie: String(serie) }
    });

    if (!produtoFinal) {
      return res.status(404).json({
        erro: 'Série não encontrada no cadastro de produtos (produza/registre antes no fluxo de produção)'
      });
    }

    if (produtoFinal.codProdutoOmie !== codProdutoOmie) {
      return res.status(400).json({
        erro: 'Série não pertence a este produto'
      });
    }

    // Estoque padrão (Omie)
    const estoquePadrao = await consultarEstoquePadrao(codProdutoOmie, empresa);

    if (!estoquePadrao) {
      return res.status(502).json({
        erro: 'Falha ao consultar estoque no Omie ou estoque padrão não encontrado'
      });
    }

    if (Number(estoquePadrao.nSaldo) <= 0) {
      return res.status(400).json({
        erro: 'Produto sem saldo no estoque padrão'
      });
    }

    const vinculo = await prisma.expedicaoSerie.create({
      data: {
        id: crypto.randomUUID(),
        expedicaoId: id,
        codProdutoOmie,
        produtoFinalId: produtoFinal.id,
        serie: String(serie)
      }
    });

    return res.json({
      ok: true,
      tipo: 'serie',
      vinculo
    });
  } catch (err) {
    console.error('Erro scanSerie:', err);
    return res.status(500).json({ erro: 'Erro interno ao escanear série' });
  }
};

/* =========================
   UPLOAD DE FOTO (POR ITEM/SCAN)
========================= */
const uploadFotoSerie = async (req, res) => {
  try {
    const { id } = req.params; // expedicaoSerieId
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
  } catch (err) {
    console.error('Erro uploadFotoSerie:', err);
    return res.status(500).json({ erro: 'Erro interno ao salvar foto' });
  }
};

/* =========================
   FINALIZAR EXPEDIÇÃO
   ✅ Itens COM série: exige contagem por série
   ✅ Itens SEM série: exige pelo menos 1 FOTO GERAL (uma evidência)
========================= */
const finalizarExpedicao = async (req, res) => {
  try {
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

    const pedidoOmie = await consultarPedidoVenda(expedicao.numeroPedido, empresa);

    if (!pedidoOmie || !Array.isArray(pedidoOmie.itens)) {
      return res.status(502).json({
        erro: 'Falha ao consultar pedido de venda no Omie'
      });
    }

    // Se existir algum item sem série, exige pelo menos 1 foto geral
    let existeItemSemSerie = false;

    for (const item of pedidoOmie.itens) {
      const possuiSerie = await produtoPossuiSerieNoSistema(item.codProdutoOmie);
      if (!possuiSerie) existeItemSemSerie = true;
    }

    if (existeItemSemSerie) {
      const qtdFotosGerais = await prisma.fotoExpedicaoGeral.count({
        where: { expedicaoId: id }
      });

      if (qtdFotosGerais === 0) {
        return res.status(400).json({
          erro:
            'O pedido possui itens sem número de série. Para finalizar, envie pelo menos 1 foto geral em /expedicao/fotos-gerais/upload.'
        });
      }
    }

    // Valida SOMENTE os itens com série
    for (const item of pedidoOmie.itens) {
      const possuiSerie = await produtoPossuiSerieNoSistema(item.codProdutoOmie);
      if (!possuiSerie) continue;

      const qtdEscaneadaComSerie = expedicao.series.filter(
        s => s.codProdutoOmie === item.codProdutoOmie && s.serie !== null && s.serie !== ''
      ).length;

      if (qtdEscaneadaComSerie < Number(item.quantidade)) {
        return res.status(400).json({
          erro: `Produto ${item.codProdutoOmie} incompleto (${qtdEscaneadaComSerie}/${item.quantidade})`
        });
      }
    }

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
  } catch (err) {
    console.error('Erro finalizarExpedicao:', err);
    return res.status(500).json({
      erro: 'Erro interno ao finalizar expedição',
      detalhe: err.response?.data || err.message
    });
  }
};

/* =========================
   RESUMO
========================= */
const resumoExpedicao = async (req, res) => {
  const { id } = req.params;

  let expedicao = null; // ✅ evita "before initialization"

  try {
    expedicao = await prisma.expedicao.findUnique({
      where: { id },
      include: {
        eventos: { orderBy: { criadoEm: 'asc' } },
        series: { include: { fotos: true } },
        fotosGerais: { orderBy: { criadoEm: 'asc' } }
      }
    });

    if (!expedicao) {
      return res.status(404).json({ erro: 'Expedição não encontrada' });
    }

    /* =========================
       BASE: ITENS DO PEDIDO (OMIE)
       - aqui definimos DESCRIÇÃO e QUANTIDADE CORRETA
    ========================= */
    const itensMap = {};
    let pedidoOmie = null;

    try {
      // ✅ usa empresa salva na expedição
      pedidoOmie = await consultarPedidoVenda(
        expedicao.numeroPedido,
        expedicao.empresa
      );

      if (pedidoOmie?.itens?.length) {
        for (const item of pedidoOmie.itens) {
          const codigo = item.codProdutoOmie;

          itensMap[codigo] = {
            codProdutoOmie: codigo,
            descricao: item.descricao || '',
            // ✅ quantidade vem do pedido, SEMPRE
            quantidade: Number(item.quantidade) || 0,
            series: [],
            fotos: []
          };
        }
      }
    } catch (err) {
      // não quebra o resumo se Omie falhar
      console.warn('Aviso: falha ao buscar pedido no Omie:', err.message);
    }

    /* =========================
       ENCAIXA: SÉRIES E FOTOS REGISTRADAS NO BANCO
       - NÃO mexe em quantidade
       - apenas adiciona series[] e fotos[]
    ========================= */
    for (const s of (expedicao.series || [])) {
      const codigo = s.codProdutoOmie;

      // se Omie falhou (ou item não está no Omie por algum motivo),
      // ainda assim mostramos o item baseado no que foi registrado.
      if (!itensMap[codigo]) {
        itensMap[codigo] = {
          codProdutoOmie: codigo,
          descricao: '',
          // fallback: se não temos pedido, cai para o comportamento antigo (conta scans)
          quantidade: 0,
          series: [],
          fotos: []
        };
      }

      // fallback: só incrementa quantidade quando não veio pedido do Omie
      if (!pedidoOmie?.itens?.length) {
        itensMap[codigo].quantidade += 1;
      }

      if (s.serie) {
        itensMap[codigo].series.push(s.serie);
      }

      if (Array.isArray(s.fotos) && s.fotos.length) {
        itensMap[codigo].fotos.push(
          ...s.fotos.map(f => ({
            id: f.id,
            url: f.url,
            criadoEm: f.criadoEm
          }))
        );
      }
    }

    const itens = Object.values(itensMap).map(item => ({
      ...item,
      tipo: item.series.length > 0 ? 'com_série' : 'sem_série'
    }));

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

        itens,

        fotosGerais: expedicao.fotosGerais.map(f => ({
          id: f.id,
          url: f.url,
          descricao: f.descricao,
          criadoEm: f.criadoEm
        }))
      }
    });
  } catch (err) {
    console.error('Erro resumoExpedicao:', err);
    return res.status(500).json({
      erro: 'Erro interno ao gerar resumo',
      detalhe: err.message
    });
  }
};

module.exports = {
  iniciarExpedicao,
  scanSerie,
  uploadFotoSerie,
  finalizarExpedicao,
  resumoExpedicao
};
