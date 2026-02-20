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

async function findQrIdAny(qrId) {
  const id = String(qrId || '').trim();
  if (!id) return null;

  return prisma.consumoPeca.findFirst({
    where: { qrId: id }
  });
}

async function findById(id) {
  return prisma.consumoPeca.findUnique({
    where: { id: String(id) }
  });
}

/**
 * Acha o consumo ATIVO (fimEm null) para uma peça dentro do contexto informado.
 * Se nenhum contexto for passado, procura só por codigoPeca (não recomendado, mas não bloqueia).
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

async function existeHistoricoComQr(codigoPeca) {
  const codigo = String(codigoPeca || '').trim();
  if (!codigo) return false;

  // Em ConsumoPeca, qrCode é obrigatório no schema.
  // Logo, qualquer histórico desta peça aqui implica rastreio por QR no processo de produção.
  const row = await prisma.consumoPeca.findFirst({
    where: {
      codigoPeca: codigo
    },
    select: { id: true }
  });

  return Boolean(row);
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
  findQrIdAny,
  findAtivoPorContexto,
  findAtivosPorContexto,
  findById,
  existeHistoricoComQr,
  create,
  update
};
