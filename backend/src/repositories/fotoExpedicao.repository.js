const { prisma } = require('../database/prisma');

async function create(data) {
  return prisma.fotoExpedicao.create({ data });
}

module.exports = { create };
