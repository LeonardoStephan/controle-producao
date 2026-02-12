// src/usecases/op/resumoOp.usecase.js
const ordemRepo = require('../../repositories/ordemProducao.repository');
const eventoRepo = require('../../repositories/eventoOP.repository');
const { FLUXO_ETAPAS } = require('../../domain/fluxoOp');
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

  for (const e of eventos) {
    const etapa = e.etapa;
    const tipo = e.tipo;
    const t = new Date(e.criadoEm);

    if (temposMs[etapa] === undefined) temposMs[etapa] = 0;

    if (tipo === 'inicio' || tipo === 'retorno') {
      if (!inicioPorEtapa[etapa]) inicioPorEtapa[etapa] = t;
      continue;
    }

    if ((tipo === 'pausa' || tipo === 'fim') && inicioPorEtapa[etapa]) {
      const diff = calcularMsDentroJornada(inicioPorEtapa[etapa], t);
      if (diff > 0) temposMs[etapa] += diff;
      inicioPorEtapa[etapa] = null;
      continue;
    }
  }

  const agora = new Date();
  for (const etapa of Object.keys(inicioPorEtapa)) {
    if (inicioPorEtapa[etapa]) {
      const diff = calcularMsDentroJornada(inicioPorEtapa[etapa], agora);
      if (diff > 0) temposMs[etapa] += diff;
    }
  }

  return temposMs;
}

async function execute({ params }) {
  const { id } = params;

  try {
    const op = await ordemRepo.findById(id);
    if (!op) return { status: 404, body: { erro: 'OP não encontrada' } };

    const eventos = await eventoRepo.findAllByOpId(id);
    if (!eventos.length) {
      // OP existe mas sem eventos ainda
      const temposPorEtapa = {};
      for (const etapa of FLUXO_ETAPAS) {
        if (etapa === 'finalizada') continue;
        temposPorEtapa[etapa] = '0s';
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
          eventos: []
        }
      };
    }

    const temposMs = calcularTempoPorEtapaMs(eventos);
    const temposPorEtapa = {};
    for (const etapa of Object.keys(temposMs)) {
      if (etapa === 'finalizada') continue;
      temposPorEtapa[etapa] = formatarDuracao(temposMs[etapa]);
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
        eventos: eventos.map((e) => ({
          ...e,
          criadoEm: formatDateTimeBr(e.criadoEm, { withDash: true })
        }))
      }
    };
  } catch (err) {
    console.error('Erro resumoOp:', err);
    return { status: 500, body: { erro: 'Erro interno ao gerar resumo' } };
  }
}

module.exports = { execute };
