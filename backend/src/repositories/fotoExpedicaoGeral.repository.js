const { prisma } = require('../database/prisma');

async function countByExpedicaoId(expedicaoId) {
  return prisma.fotoExpedicaoGeral.count({
    where: { expedicaoId: String(expedicaoId) }
  });
}

async function create(data) {
  return prisma.fotoExpedicaoGeral.create({ data });
}

async function findManyByExpedicaoId(expedicaoId) {
  return prisma.fotoExpedicaoGeral.findMany({
    where: { expedicaoId: String(expedicaoId) },
    orderBy: { criadoEm: 'asc' }
  });
}

module.exports = {
  countByExpedicaoId,
  create,
  findManyByExpedicaoId
};
