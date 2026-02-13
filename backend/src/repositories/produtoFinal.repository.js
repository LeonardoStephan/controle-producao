const { prisma } = require('../database/prisma');

async function findFirstByOpId(opId, select) {
  return prisma.produtoFinal.findFirst({
    where: { opId: String(opId) },
    select: select || { id: true }
  });
}

async function existsAnyByOpId(opId) {
  const pf = await prisma.produtoFinal.findFirst({
    where: { opId: String(opId) },
    select: { id: true }
  });
  return !!pf;
}

async function findFirstWithCodProdutoOmie(opId) {
  return prisma.produtoFinal.findFirst({
    where: { opId: String(opId), codProdutoOmie: { not: null } },
    select: { codProdutoOmie: true }
  });
}

async function findById(id) {
  return prisma.produtoFinal.findUnique({
    where: { id: String(id) }
  });
}

async function findByIdSelect(id, select) {
  return prisma.produtoFinal.findUnique({
    where: { id: String(id) },
    select
  });
}

async function findFirstCodProdutoOmieDaOp(opId) {
  return prisma.produtoFinal.findFirst({
    where: { opId: String(opId), codProdutoOmie: { not: null } },
    select: { codProdutoOmie: true }
  });
}

async function findBySerie(serie) {
  return prisma.produtoFinal.findUnique({
    where: { serie: String(serie) }
  });
}

async function create(data) {
  return prisma.produtoFinal.create({ data });
}

async function listSeriesByOpId(opId) {
  const rows = await prisma.produtoFinal.findMany({
    where: { opId: String(opId) },
    select: { serie: true }
  });
  return rows.map((r) => String(r.serie).trim()).filter(Boolean);
}

async function findFirstByCodProdutoOmie(codProdutoOmie, select) {
  return prisma.produtoFinal.findFirst({
    where: { codProdutoOmie: String(codProdutoOmie) },
    select: select || { id: true }
  });
}

module.exports = {
  findFirstByOpId,
  existsAnyByOpId,
  findFirstWithCodProdutoOmie,
  findById,
  findByIdSelect,
  findFirstCodProdutoOmieDaOp,
  findBySerie,
  create,
  listSeriesByOpId,
  findFirstByCodProdutoOmie
};
