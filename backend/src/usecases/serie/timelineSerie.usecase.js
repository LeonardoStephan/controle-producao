const { prisma } = require('../../database/prisma');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');
const { formatDateTimeBr } = require('../../utils/dateBr');
const { carregarMapaNomePorCracha, nomePorCrachaOuOriginal } = require('../../utils/funcionarioNome');

function asDateIso(date) {
  if (!date) return null;
  try {
    return new Date(date).toISOString();
  } catch (_e) {
    return null;
  }
}

function toTimelineItem({ dominio, tipo, data, referencia, detalhes }) {
  const iso = asDateIso(data);
  if (!iso) return null;
  return {
    dominio,
    tipo,
    data: iso,
    dataBr: formatDateTimeBr(data, { withDash: true }),
    referencia: referencia || null,
    detalhes: detalhes || null
  };
}

function coletarCrachas({ producao, expedicao, manutencao }) {
  const crachas = [];
  for (const e of producao?.op?.eventos || []) crachas.push(e.funcionarioId);
  for (const s of producao?.subprodutos || []) crachas.push(s.funcionarioId);
  for (const p of producao?.pecas || []) crachas.push(p.funcionarioId);
  for (const ex of expedicao || []) {
    if (ex?.expedicao?.funcionarioId) crachas.push(ex.expedicao.funcionarioId);
    for (const e of ex?.expedicao?.eventos || []) crachas.push(e.funcionarioId);
  }
  for (const m of manutencao || []) {
    for (const e of m?.manutencao?.eventos || []) crachas.push(e.funcionarioId);
    for (const p of m?.manutencao?.pecasTrocadas || []) crachas.push(p.funcionarioId);
  }
  return crachas;
}

function aplicarNomesFuncionario({ producao, expedicao, manutencao }, mapaNomes) {
  if (producao?.op?.eventos) {
    for (const e of producao.op.eventos) {
      e.funcionarioNome = nomePorCrachaOuOriginal(e.funcionarioId, mapaNomes);
    }
  }
  if (producao?.subprodutos) {
    for (const s of producao.subprodutos) {
      s.funcionarioNome = nomePorCrachaOuOriginal(s.funcionarioId, mapaNomes);
    }
  }
  if (producao?.pecas) {
    for (const p of producao.pecas) {
      p.funcionarioNome = nomePorCrachaOuOriginal(p.funcionarioId, mapaNomes);
    }
  }

  for (const ex of expedicao || []) {
    if (ex?.expedicao?.funcionarioId) {
      ex.expedicao.funcionarioNome = nomePorCrachaOuOriginal(ex.expedicao.funcionarioId, mapaNomes);
    }
    for (const e of ex?.expedicao?.eventos || []) {
      e.funcionarioNome = nomePorCrachaOuOriginal(e.funcionarioId, mapaNomes);
    }
  }

  for (const m of manutencao || []) {
    for (const e of m?.manutencao?.eventos || []) {
      e.funcionarioNome = nomePorCrachaOuOriginal(e.funcionarioId, mapaNomes);
    }
    for (const p of m?.manutencao?.pecasTrocadas || []) {
      p.funcionarioNome = nomePorCrachaOuOriginal(p.funcionarioId, mapaNomes);
    }
  }
}

function manterSomenteNomeFuncionario({ producao, expedicao, manutencao }) {
  if (producao?.op?.eventos) {
    for (const e of producao.op.eventos) {
      delete e.funcionarioId;
    }
  }
  if (producao?.subprodutos) {
    for (const s of producao.subprodutos) {
      delete s.funcionarioId;
    }
  }
  if (producao?.pecas) {
    for (const p of producao.pecas) {
      delete p.funcionarioId;
    }
  }

  for (const ex of expedicao || []) {
    if (ex?.expedicao) {
      delete ex.expedicao.funcionarioId;
    }
    for (const e of ex?.expedicao?.eventos || []) {
      delete e.funcionarioId;
    }
  }

  for (const m of manutencao || []) {
    for (const e of m?.manutencao?.eventos || []) {
      delete e.funcionarioId;
    }
    for (const p of m?.manutencao?.pecasTrocadas || []) {
      delete p.funcionarioId;
    }
  }
}

async function carregarProducao(serie, produtoFinal) {
  if (!produtoFinal) return { produtoFinal: null, op: null, subprodutos: [], pecas: [] };

  const op = await prisma.ordemProducao.findUnique({
    where: { id: String(produtoFinal.opId) },
    include: { eventos: { orderBy: { criadoEm: 'asc' } } }
  });

  const subprodutos = await prisma.subproduto.findMany({
    where: { serieProdFinalId: String(produtoFinal.id) },
    orderBy: { id: 'asc' }
  });

  const subprodutoIds = subprodutos.map((s) => String(s.id));
  const pecas = await prisma.consumoPeca.findMany({
    where: {
      OR: [
        { serieProdFinalId: String(produtoFinal.id) },
        subprodutoIds.length > 0 ? { subprodutoId: { in: subprodutoIds } } : undefined
      ].filter(Boolean)
    },
    orderBy: { inicioEm: 'asc' }
  });

  return {
    produtoFinal: {
      id: produtoFinal.id,
      serie: produtoFinal.serie,
      codProdutoOmie: produtoFinal.codProdutoOmie || null,
      criadoEm: formatDateTimeBr(produtoFinal.criadoEm, { withDash: true }),
      criadoEmIso: asDateIso(produtoFinal.criadoEm)
    },
    op: op
      ? {
          id: op.id,
          numeroOP: op.numeroOP,
          empresa: op.empresa,
          descricaoProduto: op.descricaoProduto,
          status: op.status,
          criadoEm: formatDateTimeBr(op.criadoEm, { withDash: true }),
          eventos: (op.eventos || []).map((e) => ({
            etapa: e.etapa,
            tipo: e.tipo,
            funcionarioId: e.funcionarioId,
            criadoEm: formatDateTimeBr(e.criadoEm, { withDash: true }),
            criadoEmIso: asDateIso(e.criadoEm)
          }))
        }
      : null,
    subprodutos: subprodutos.map((s) => ({
      id: s.id,
      etiquetaId: s.etiquetaId,
      codigoSubproduto: s.codigoSubproduto,
      opNumeroSubproduto: s.opNumeroSubproduto,
      funcionarioId: s.funcionarioId
    })),
    pecas: pecas.map((p) => ({
      id: p.id,
      codigoPeca: p.codigoPeca,
      qrCode: p.qrCode,
      qrId: p.qrId || null,
      funcionarioId: p.funcionarioId,
      inicioEm: formatDateTimeBr(p.inicioEm, { withDash: true }),
      fimEm: formatDateTimeBr(p.fimEm, { withDash: true }),
      serieProdFinalId: p.serieProdFinalId || null,
      subprodutoId: p.subprodutoId || null
    }))
  };
}

async function carregarExpedicao(serie, produtoFinal) {
  const whereSerie = { serie: String(serie) };
  const wherePf = produtoFinal?.id ? { serieProdFinalId: String(produtoFinal.id) } : null;

  const series = await prisma.expedicaoSerie.findMany({
    where: {
      OR: [whereSerie, wherePf].filter(Boolean)
    },
    include: {
      expedicao: {
        include: {
          eventos: { orderBy: { criadoEm: 'asc' } }
        }
      },
      fotos: { orderBy: { criadoEm: 'asc' } }
    },
    orderBy: { id: 'asc' }
  });

  return series.map((es) => ({
    id: es.id,
    serie: es.serie || null,
    codProdutoOmie: es.codProdutoOmie || null,
    serieProdFinalId: es.serieProdFinalId || null,
    expedicao: es.expedicao
      ? {
          id: es.expedicao.id,
          numeroPedido: es.expedicao.numeroPedido,
          empresa: es.expedicao.empresa || null,
          status: es.expedicao.status,
          funcionarioId: es.expedicao.funcionarioId,
          iniciadoEm: formatDateTimeBr(es.expedicao.iniciadoEm, { withDash: true }),
          finalizadoEm: formatDateTimeBr(es.expedicao.finalizadoEm, { withDash: true }),
          eventos: (es.expedicao.eventos || []).map((e) => ({
            tipo: e.tipo,
            funcionarioId: e.funcionarioId,
            criadoEm: formatDateTimeBr(e.criadoEm, { withDash: true }),
            criadoEmIso: asDateIso(e.criadoEm)
          }))
        }
      : null,
    fotos: (es.fotos || []).map((f) => ({
      id: f.id,
      url: f.url,
      criadoEm: formatDateTimeBr(f.criadoEm, { withDash: true })
    }))
  }));
}

async function carregarManutencao(serie, produtoFinal) {
  const whereSerie = { serie: String(serie) };
  const wherePf = produtoFinal?.id ? { serieProdFinalId: String(produtoFinal.id) } : null;

  const series = await prisma.manutencaoSerie.findMany({
    where: {
      OR: [whereSerie, wherePf].filter(Boolean)
    },
    include: {
      manutencao: {
        include: {
          eventos: { orderBy: { criadoEm: 'asc' } },
          pecasTrocadas: { orderBy: { criadoEm: 'asc' } }
        }
      }
    },
    orderBy: { criadoEm: 'asc' }
  });

  return series.map((ms) => {
    const manutencao = ms.manutencao;
    const pecasDaSerie = (manutencao?.pecasTrocadas || []).filter(
      (p) => p.manutencaoSerieId && String(p.manutencaoSerieId) === String(ms.id)
    );

    return {
      serie: {
        id: ms.id,
        serie: ms.serie,
        codProdutoOmie: ms.codProdutoOmie || null,
        serieProdFinalId: ms.serieProdFinalId || null,
        criadoEm: formatDateTimeBr(ms.criadoEm, { withDash: true })
      },
      manutencao: manutencao
        ? {
            id: manutencao.id,
            numeroOS: manutencao.numeroOS,
            empresa: manutencao.empresa,
            status: manutencao.status,
            codProdutoOmie: manutencao.codProdutoOmie || null,
            clienteNome: manutencao.clienteNome || null,
            dataEntrada: formatDateTimeBr(manutencao.dataEntrada, { withDash: true }),
            dataFinalizacao: formatDateTimeBr(manutencao.dataFinalizacao, { withDash: true }),
            eventos: (manutencao.eventos || []).map((e) => ({
              tipo: e.tipo,
              funcionarioId: e.funcionarioId,
              setor: e.setor || null,
              observacao: e.observacao || null,
              criadoEm: formatDateTimeBr(e.criadoEm, { withDash: true }),
              criadoEmIso: asDateIso(e.criadoEm)
            })),
            pecasTrocadas: pecasDaSerie.map((p) => ({
              id: p.id,
              codigoPeca: p.codigoPeca,
              codigoSubproduto: p.codigoSubproduto || null,
              qrId: p.qrId || null,
              quantidade: p.quantidade,
              funcionarioId: p.funcionarioId,
              criadoEm: formatDateTimeBr(p.criadoEm, { withDash: true }),
              fimEm: formatDateTimeBr(p.fimEm, { withDash: true })
            }))
          }
        : null
    };
  });
}

function montarTimeline({ producao, expedicao, manutencao }) {
  const itens = [];

  if (producao?.produtoFinal) {
    itens.push(
      toTimelineItem({
        dominio: 'producao',
        tipo: 'produto_final_criado',
        data: producao.produtoFinal.criadoEmIso
      })
    );
  }

  for (const e of producao?.op?.eventos || []) {
    itens.push(
      toTimelineItem({
        dominio: 'producao',
        tipo: `op_${e.tipo}`,
        data: e.criadoEmIso,
        referencia: producao.op.numeroOP,
        detalhes: {
          etapa: e.etapa,
          funcionarioNome: e.funcionarioNome || null
        }
      })
    );
  }

  for (const ex of expedicao || []) {
    for (const ev of ex.expedicao?.eventos || []) {
      itens.push(
        toTimelineItem({
        dominio: 'expedicao',
        tipo: `expedicao_${ev.tipo}`,
        data: ev.criadoEmIso,
        referencia: ex.expedicao?.numeroPedido || null,
        detalhes: {
          funcionarioNome: ev.funcionarioNome || null
        }
      })
    );
  }
  }

  for (const m of manutencao || []) {
    for (const ev of m.manutencao?.eventos || []) {
      itens.push(
        toTimelineItem({
        dominio: 'manutencao',
        tipo: ev.tipo,
        data: ev.criadoEmIso,
        referencia: m.manutencao?.numeroOS || null,
        detalhes: {
          funcionarioNome: ev.funcionarioNome || null,
          setor: ev.setor || null
        }
      })
    );
    }
  }

  return itens
    .filter(Boolean)
    .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
}

async function execute({ params }) {
  const serie = String(params?.serie || '').trim();
  if (!serie) return { status: 400, body: { erro: 'série obrigatória' } };
  if (!/^\d+$/.test(serie)) {
    return {
      status: 400,
      body: { erro: 'série inválida: informe apenas números (ex.: 3006163)' }
    };
  }

  const produtoFinal = await produtoFinalRepo.findBySerie(serie);
  const producao = await carregarProducao(serie, produtoFinal);
  const expedicao = await carregarExpedicao(serie, produtoFinal);
  const manutencao = await carregarManutencao(serie, produtoFinal);
  const mapaNomes = await carregarMapaNomePorCracha(coletarCrachas({ producao, expedicao, manutencao }));
  aplicarNomesFuncionario({ producao, expedicao, manutencao }, mapaNomes);
  manterSomenteNomeFuncionario({ producao, expedicao, manutencao });
  const timeline = montarTimeline({ producao, expedicao, manutencao });

  return {
    status: 200,
    body: {
      ok: true,
      serie,
      resumo: {
        encontradoProdutoFinal: Boolean(producao?.produtoFinal),
        totalExpedicoes: expedicao.length,
        totalManutencoes: manutencao.length,
        totalEventosTimeline: timeline.length
      },
      producao,
      expedicao,
      manutencao,
      timeline
    }
  };
}

module.exports = { execute };
