const { prisma } = require('../database/prisma');

async function findManyByOpId(opId) {
  return prisma.subproduto.findMany({
    where: { opId: String(opId) },
    select: { codigoSubproduto: true }
  });
}

async function findByEtiqueta(etiquetaId) {
  return prisma.subproduto.findUnique({
    where: { etiquetaId: String(etiquetaId) }
  });
}

async function findByEtiquetaId(etiquetaId) {
  return findByEtiqueta(etiquetaId);
}

async function findMesmoCodigoNoMesmoPF({ serieProdFinalId, codigoSubproduto, etiquetaIdNot }) {
  return prisma.subproduto.findFirst({
    where: {
      serieProdFinalId: String(serieProdFinalId),
      codigoSubproduto: String(codigoSubproduto),
      etiquetaId: { not: String(etiquetaIdNot) }
    },
    select: { id: true, etiquetaId: true, codigoSubproduto: true }
  });
}

async function findById(id) {
  return prisma.subproduto.findUnique({ where: { id: String(id) } });
}

async function listEtiquetasByOpId(opId) {
  const rows = await prisma.subproduto.findMany({
    where: { opId: String(opId) },
    select: { etiquetaId: true }
  });
  return rows.map((r) => String(r.etiquetaId).trim()).filter(Boolean);
}

async function findManyBySerieProdFinalId(serieProdFinalId) {
  return prisma.subproduto.findMany({
    where: { serieProdFinalId: String(serieProdFinalId) },
    select: { id: true, etiquetaId: true, codigoSubproduto: true }
  });
}

async function create(data) {
  return prisma.subproduto.create({ data });
}

async function updateByEtiquetaId(etiquetaId, data) {
  return prisma.subproduto.update({
    where: { etiquetaId: String(etiquetaId) },
    data
  });
}

async function countRegistradosNaOp(opId) {
  return prisma.subproduto.count({
    where: { opId: String(opId), serieProdFinalId: null }
  });
}

async function countConsumidosNaOpAgrupado(opId) {
  // Importante:
  // Subproduto.opId representa a OP de origem do subproduto (ex.: OP da placa).
  // Para validar consumo na OP final, precisamos contar os subprodutos vinculados
  // aos produtos finais da OP final (via relação serieProdFinalId -> ProdutoFinal.opId).
  const rows = await prisma.subproduto.findMany({
    where: {
      serieProdFinalId: { not: null },
      produtoFinal: { opId: String(opId) }
    },
    select: { codigoSubproduto: true }
  });

  const map = {};
  for (const r of rows) {
    const key = String(r.codigoSubproduto || '').trim();
    if (!key) continue;
    map[key] = Number(map[key] || 0) + 1;
  }
  return map;
}

module.exports = {
  findManyByOpId,
  findByEtiqueta,
  findByEtiquetaId,
  findMesmoCodigoNoMesmoPF,
  create,
  updateByEtiquetaId,
  countRegistradosNaOp,
  countConsumidosNaOpAgrupado,
  findById,
  listEtiquetasByOpId,
  findManyBySerieProdFinalId
};
