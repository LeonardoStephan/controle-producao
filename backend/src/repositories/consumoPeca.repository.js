// src/repositories/consumoPeca.repository.js
const { prisma } = require('../database/prisma');

async function findQrAtivo(qrCode) {
  const qr = String(qrCode || '').trim();
  if (!qr) return null;

  return prisma.consumoPeca.findFirst({
    where: { qrCode: qr, fimEm: null }
  });
}

async function findQrIdAtivo(qrId) {
  const id = String(qrId || '').trim();
  if (!id) return null;

  return prisma.consumoPeca.findFirst({
    where: { qrId: id, fimEm: null }
  });
}

async function findById(id) {
  return prisma.consumoPeca.findUnique({
    where: { id: String(id) }
  });
}

/**
 * Acha o consumo ATIVO (fimEm null) para uma peça dentro do contexto informado.
 * - Contexto pode ser subprodutoId OU serieProdFinalId.
 * - Se nenhum contexto for passado, procura só por codigoPeca (não recomendado, mas não bloqueia).
 */
async function findAtivoPorContexto({ codigoPeca, subprodutoId, serieProdFinalId }) {
  const codigo = String(codigoPeca || '').trim();
  if (!codigo) return null;

  const spId = subprodutoId ? String(subprodutoId).trim() : null;
  const pfId = serieProdFinalId ? String(serieProdFinalId).trim() : null;

  return prisma.consumoPeca.findFirst({
    where: {
      codigoPeca: codigo,
      fimEm: null,
      subprodutoId: spId || undefined,
      serieProdFinalId: pfId || undefined
    },
    orderBy: { inicioEm: 'desc' }
  });
}

async function findAtivosPorContexto({ codigoPeca, subprodutoId, serieProdFinalId }) {
  const codigo = String(codigoPeca || '').trim();
  if (!codigo) return [];

  const spId = subprodutoId ? String(subprodutoId).trim() : null;
  const pfId = serieProdFinalId ? String(serieProdFinalId).trim() : null;

  return prisma.consumoPeca.findMany({
    where: {
      codigoPeca: codigo,
      fimEm: null,
      subprodutoId: spId || undefined,
      serieProdFinalId: pfId || undefined
    },
    orderBy: { inicioEm: 'desc' }
  });
}

async function findMany({ opId, subprodutoId, serieProdFinalId }) {
  return prisma.consumoPeca.findMany({
    where: {
      opId: opId || undefined,
      subprodutoId: subprodutoId || undefined,
      serieProdFinalId: serieProdFinalId || undefined
    },
    orderBy: { inicioEm: 'asc' }
  });
}

async function create(tx, data) {
  const client = tx || prisma;
  return client.consumoPeca.create({ data });
}

async function update(tx, id, data) {
  const client = tx || prisma;
  return client.consumoPeca.update({
    where: { id: String(id) },
    data
  });
}

module.exports = {
  findQrAtivo,
  findQrIdAtivo,
  findAtivoPorContexto,
  findAtivosPorContexto,
  findById,
  findMany,
  create,
  update
};
