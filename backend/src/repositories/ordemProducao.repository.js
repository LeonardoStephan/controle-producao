const { prisma } = require('../database/prisma');

async function findById(id) {
  return prisma.ordemProducao.findUnique({ where: { id: String(id) } });
}

async function findByNumeroOP(numeroOP) {
  return prisma.ordemProducao.findFirst({ where: { numeroOP: String(numeroOP) } });
}

async function create(data) {
  return prisma.ordemProducao.create({ data });
}

async function updateStatus(id, status) {
  return prisma.ordemProducao.update({
    where: { id: String(id) },
    data: { status }
  });
}

async function updateById(id, data) {
  return prisma.ordemProducao.update({
    where: { id: String(id) },
    data
  });
}

async function findWithMateriaisById(id) {
  return prisma.ordemProducao.findUnique({
    where: { id: String(id) },
    include: {
      produtosFinais: {
        include: {
          subprodutos: true,
          consumosPeca: true
        }
      },
      subprodutos: true,
      eventos: true
    }
  });
}

module.exports = {
  findById,
  findByNumeroOP,
  create,
  updateStatus,
  updateById,
  findWithMateriaisById
};
