// src/usecases/op/adicionarEvento.usecase.js
const crypto = require('crypto');

const { TIPOS_EVENTO } = require('../../domain/fluxoOp');
const { validarSequenciaEvento } = require('../../domain/eventoSequencia');
const { isDentroJornada } = require('../../domain/jornadaTrabalho');
const ordemRepo = require('../../repositories/ordemProducao.repository');
const eventoRepo = require('../../repositories/eventoOP.repository');

async function execute(input = {}) {
  // ✅ suporta dois formatos:
  // 1) { id, tipo, funcionarioId }
  // 2) { params: { id }, body: { tipo, funcionarioId } }
  const id = input?.id ?? input?.params?.id;
  const tipo = input?.tipo ?? input?.body?.tipo;
  const funcionarioId = input?.funcionarioId ?? input?.body?.funcionarioId;

  if (!id) {
    return { status: 400, body: { erro: 'id da OP é obrigatório' } };
  }

  if (!TIPOS_EVENTO.includes(tipo)) {
    return { status: 400, body: { erro: 'Tipo de evento inválido' } };
  }

  if (!funcionarioId) {
    return { status: 400, body: { erro: 'funcionarioId é obrigatório' } };
  }

  // inicio/fim não entram aqui
  if (tipo === 'inicio' || tipo === 'fim') {
    return {
      status: 400,
      body: { erro: 'Use os endpoints específicos para início ou finalização' }
    };
  }

  const op = await ordemRepo.findById(String(id));
  if (!op) return { status: 404, body: { erro: 'OP não encontrada' } };

  const etapaAtual = op.status;

  const ultimoEvento = await eventoRepo.findUltimoEvento(String(id), etapaAtual);

  const check = validarSequenciaEvento({
    ultimoTipo: ultimoEvento?.tipo || null,
    novoTipo: tipo,
    permitirFimSemPausa: false
  });

  if (!check.ok) {
    return { status: 400, body: { erro: check.erro } };
  }

  if (tipo === 'retorno' && !isDentroJornada(new Date())) {
    return {
      status: 400,
      body: { erro: 'Retorno permitido somente na jornada: 07:00-12:00 e 13:00-17:00' }
    };
  }

  await eventoRepo.create({
    id: crypto.randomUUID(),
    opId: String(id),
    tipo,
    etapa: etapaAtual,
    funcionarioId: String(funcionarioId)
  });

  return { status: 200, body: { ok: true } };
}

module.exports = { execute };
