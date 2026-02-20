const expedicaoRepo = require('../../repositories/expedicao.repository');
const { consultarPedidoVenda } = require('../../integrations/omie/omie.facade');
const { formatDateTimeBr } = require('../../utils/dateBr');
const { carregarMapaNomePorCracha, nomePorCrachaOuOriginal } = require('../../utils/funcionarioNome');

async function execute({ params }) {
  const empresa = String(params?.empresa || '').trim();
  const numeroPedido = String(params?.numeroPedido || '').trim();

  if (!empresa || !numeroPedido) {
    return { status: 400, body: { erro: 'empresa e numeroPedido são obrigatórios' } };
  }

  let expedicao = null;

  try {
    expedicao = await expedicaoRepo.findResumoByNumeroPedidoEmpresa(numeroPedido, empresa);

    if (!expedicao) {
      return { status: 404, body: { erro: 'Expedição não encontrada' } };
    }

    const itensMap = {};
    let pedidoOmie = null;

    try {
      pedidoOmie = await consultarPedidoVenda(expedicao.numeroPedido, expedicao.empresa);

      if (pedidoOmie?.itens?.length) {
        for (const item of pedidoOmie.itens) {
          const codigo = item.codProdutoOmie;

          itensMap[codigo] = {
            codProdutoOmie: codigo,
            descricao: item.descricao || '',
            quantidade: Number(item.quantidade) || 0,
            series: [],
            fotos: []
          };
        }
      }
    } catch (err) {
      console.warn('Aviso: falha ao buscar pedido no Omie:', err.message);
    }

    for (const s of (expedicao.series || [])) {
      const codigo = s.codProdutoOmie;

      if (!itensMap[codigo]) {
        itensMap[codigo] = {
          codProdutoOmie: codigo,
          descricao: '',
          quantidade: 0,
          series: [],
          fotos: []
        };
      }

      if (!pedidoOmie?.itens?.length) {
        itensMap[codigo].quantidade += 1;
      }

      if (s.serie) itensMap[codigo].series.push(s.serie);

      if (Array.isArray(s.fotos) && s.fotos.length) {
        itensMap[codigo].fotos.push(
          ...s.fotos.map((f) => ({
            id: f.id,
            url: f.url,
            criadoEm: formatDateTimeBr(f.criadoEm, { withDash: true })
          }))
        );
      }
    }

    const itens = Object.values(itensMap).map((item) => ({
      ...item,
      tipo: item.series.length > 0 ? 'Com série' : 'Sem série'
    }));

    const mapaNomes = await carregarMapaNomePorCracha((expedicao.eventos || []).map((e) => e.funcionarioId));

    return {
      status: 200,
      body: {
        expedicao: {
          id: expedicao.id,
          numeroPedido: expedicao.numeroPedido,
          status: expedicao.status,
          iniciadoEm: formatDateTimeBr(expedicao.iniciadoEm, { withDash: true }),
          finalizadoEm: formatDateTimeBr(expedicao.finalizadoEm, { withDash: true }),

          eventos: (expedicao.eventos || []).map((e) => ({
            tipo: e.tipo,
            funcionarioNome: nomePorCrachaOuOriginal(e.funcionarioId, mapaNomes),
            criadoEm: formatDateTimeBr(e.criadoEm, { withDash: true })
          })),

          itens,

          fotosGerais: (expedicao.fotosGerais || []).map((f) => ({
            id: f.id,
            url: f.url,
            descricao: f.descricao,
            criadoEm: formatDateTimeBr(f.criadoEm, { withDash: true })
          }))
        }
      }
    };
  } catch (err) {
    console.error('Erro resumoExpedicao:', err);
    return { status: 500, body: { erro: 'Erro interno ao gerar resumo', detalhe: err.message } };
  }
}

module.exports = { execute };
