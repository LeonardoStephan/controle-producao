const { prisma } = require('../database/prisma');

async function findById(id) {
  return prisma.expedicaoSerie.findUnique({
    where: { id: String(id) }
  });
}

async function findBySerieGlobal(serie) {
  return prisma.expedicaoSerie.findFirst({
    where: { serie: String(serie) }
  });
}

async function create(data) {
  return prisma.expedicaoSerie.create({ data });
}

module.exports = { findById, findBySerieGlobal, create };
