// src/usecases/op/rastreabilidadeMateriais.usecase.js
const ordemRepo = require('../../repositories/ordemProducao.repository');
const { FLUXO_ETAPAS } = require('../../domain/fluxoOp');
const { consultarProdutoNoOmie } = require('../../integrations/omie/omie.produto');
const { formatDateTimeBr } = require('../../utils/dateBr');
const { calcularMsDentroJornada } = require('../../domain/jornadaTrabalho');

function formatarDuracao(ms) {
  const totalSeg = Math.floor(ms / 1000);
  const horas = Math.floor(totalSeg / 3600);
  const minutos = Math.floor((totalSeg % 3600) / 60);
  const segundos = totalSeg % 60;

  if (totalSeg <= 0) return '0s';
  if (horas > 0) return `${horas}h${minutos}m${segundos}s`;
  if (minutos > 0) return `${minutos}m${segundos}s`;
  return `${segundos}s`;
}

function calcularTempoPorEtapaMs(eventos) {
  const temposMs = {};
  for (const etapa of FLUXO_ETAPAS) temposMs[etapa] = 0;

  const inicioPorEtapa = {};

  for (const e of eventos || []) {
    const etapa = e.etapa;
    const tipo = e.tipo;
    const t = new Date(e.criadoEm);

    if (!etapa) continue;
    if (temposMs[etapa] === undefined) temposMs[etapa] = 0;

    if (tipo === 'inicio' || tipo === 'retorno') {
      if (!inicioPorEtapa[etapa]) inicioPorEtapa[etapa] = t;
      continue;
    }

    if ((tipo === 'pausa' || tipo === 'fim') && inicioPorEtapa[etapa]) {
      const diff = calcularMsDentroJornada(inicioPorEtapa[etapa], t);
      if (diff > 0) temposMs[etapa] += diff;
      inicioPorEtapa[etapa] = null;
    }
  }

  return temposMs;
}

async function execute({ params }) {
  const { id } = params;

  try {
    const op = await ordemRepo.findWithMateriaisById(id);
    if (!op) return { status: 404, body: { erro: 'OP nao encontrada' } };

    const eventos = (op.eventos || []).slice().sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm));

    const temposMs = calcularTempoPorEtapaMs(eventos);
    const temposPorEtapa = {};
    for (const etapa of Object.keys(temposMs)) {
      if (etapa === 'finalizada') continue;
      temposPorEtapa[etapa] = formatarDuracao(temposMs[etapa]);
    }

    const empresa = String(op.empresa || '').trim();

    const codigos = new Set();
    for (const pf of op.produtosFinais || []) {
      for (const sp of pf.subprodutos || []) {
        const codigo = String(sp.codigoSubproduto || '').trim();
        if (codigo) codigos.add(codigo);
      }
      for (const c of pf.consumosPeca || []) {
        const codigo = String(c.codigoPeca || '').trim();
        if (codigo) codigos.add(codigo);
      }
    }

    const descricaoPorCodigo = {};
    if (empresa && codigos.size > 0) {
      const resultados = await Promise.all(
        [...codigos].map(async (codigo) => {
          try {
            const produto = await consultarProdutoNoOmie(codigo, empresa);
            return [codigo, produto?.descricao || null];
          } catch {
            return [codigo, null];
          }
        })
      );

      for (const [codigo, descricao] of resultados) {
        descricaoPorCodigo[codigo] = descricao;
      }
    }

    return {
      status: 200,
      body: {
        op: {
          id: op.id,
          numeroOP: op.numeroOP,
          empresa: op.empresa || null,
          produto: op.descricaoProduto,
          quantidade: op.quantidadeProduzida,
          status: op.status
        },

        temposPorEtapa,

        produtosFinais: (op.produtosFinais || []).map((pf) => ({
          id: pf.id,
          serie: pf.serie,
          codProdutoOmie: pf.codProdutoOmie || null,

          subprodutos: (pf.subprodutos || []).map((sp) => ({
            id: sp.id,
            etiquetaId: sp.etiquetaId || null,
            codigoSubproduto: sp.codigoSubproduto || null,
            descricao: descricaoPorCodigo[String(sp.codigoSubproduto || '').trim()] || null,
            opNumeroSubproduto: sp.opNumeroSubproduto || null,
            criadoEm: formatDateTimeBr(sp.criadoEm, { withDash: true })
          })),

          pecasConsumidas: (pf.consumosPeca || []).map((c) => ({
            codigoPeca: c.codigoPeca,
            descricao: descricaoPorCodigo[String(c.codigoPeca || '').trim()] || null,
            qrCode: c.qrCode,
            qrId: c.qrId || null,
            inicioEm: formatDateTimeBr(c.inicioEm, { withDash: true }),
            fimEm: formatDateTimeBr(c.fimEm, { withDash: true }),
            subprodutoId: c.subprodutoId || null
          }))
        }))
      }
    };
  } catch (err) {
    console.error('Erro rastreabilidadeMateriais:', err);
    return { status: 500, body: { erro: 'Erro interno ao gerar rastreabilidade' } };
  }
}

module.exports = { execute };
