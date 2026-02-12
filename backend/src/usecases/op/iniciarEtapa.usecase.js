const crypto = require('crypto');

const ordemRepo = require('../../repositories/ordemProducao.repository');
const eventoRepo = require('../../repositories/eventoOP.repository');
const { FLUXO_ETAPAS } = require('../../domain/fluxoOp');

async function execute({ params = {}, body = {} }) {
  const { id, etapa } = params;
  const { funcionarioId } = body;

  if (!id || !etapa) {
    return { status: 400, body: { erro: 'Parametros obrigatorios ausentes (id, etapa)' } };
  }

  if (!funcionarioId) {
    return { status: 400, body: { erro: 'funcionarioId e obrigatorio' } };
  }

  if (!FLUXO_ETAPAS.includes(etapa) || etapa === 'finalizada') {
    return { status: 400, body: { erro: 'Etapa invalida para inicio manual' } };
  }

  const op = await ordemRepo.findById(String(id));
  if (!op) return { status: 404, body: { erro: 'OP nao encontrada' } };

  if (op.status !== etapa) {
    return {
      status: 400,
      body: { erro: `Nao e possivel iniciar ${etapa}. Etapa atual: ${op.status}` }
    };
  }

  const ultimoEvento = await eventoRepo.findUltimoEvento(String(id), etapa);

  if (!ultimoEvento) {
    await eventoRepo.create({
      id: crypto.randomUUID(),
      opId: String(id),
      etapa,
      tipo: 'inicio',
      funcionarioId: String(funcionarioId)
    });
    return { status: 200, body: { ok: true, etapaIniciada: etapa } };
  }

  if (ultimoEvento.tipo === 'inicio' || ultimoEvento.tipo === 'retorno') {
    return { status: 400, body: { erro: `Etapa ${etapa} ja esta iniciada` } };
  }

  if (ultimoEvento.tipo === 'pausa') {
    return { status: 400, body: { erro: `Etapa ${etapa} esta pausada. Use retorno` } };
  }

  return {
    status: 400,
    body: { erro: `Nao e possivel iniciar ${etapa} apos evento ${ultimoEvento.tipo}` }
  };
}

module.exports = { execute };
