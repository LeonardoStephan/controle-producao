const { prisma } = require('../database/prisma');

async function create(data) {
  return prisma.manutencaoPecaTrocada.create({ data });
}

module.exports = { create };
