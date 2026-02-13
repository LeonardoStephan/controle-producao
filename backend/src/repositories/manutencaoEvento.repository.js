const { prisma } = require('../database/prisma');

async function create(data) {
  return prisma.manutencaoEvento.create({ data });
}

module.exports = { create };
