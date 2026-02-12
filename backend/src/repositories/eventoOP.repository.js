// src/repositories/eventoOP.repository.js
const { prisma } = require('../database/prisma');

const TIPOS_CONTROLE = ['inicio', 'pausa', 'retorno', 'fim'];

async function create(data) {
  return prisma.eventoOP.create({ data });
}

async function findAllByOpId(opId) {
  return prisma.eventoOP.findMany({
    where: { opId: String(opId) },
    orderBy: { criadoEm: 'asc' }
  });
}

/**
 * ✅ Retorna o último evento APENAS de CONTROLE da etapa:
 * inicio / pausa / retorno / fim
 * (Ignora consumo_subproduto, registro_subproduto, consumo_peca etc)
 */
async function findUltimoEvento(opId, etapa) {
  return prisma.eventoOP.findFirst({
    where: {
      opId: String(opId),
      etapa: String(etapa),
      tipo: { in: TIPOS_CONTROLE }
    },
    orderBy: { criadoEm: 'desc' }
  });
}

module.exports = {
  create,
  findAllByOpId,
  findUltimoEvento
};
