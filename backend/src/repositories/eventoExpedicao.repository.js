const { prisma } = require('../database/prisma');

async function create(data) {
  return prisma.eventoExpedicao.create({ data });
}

module.exports = { create };
