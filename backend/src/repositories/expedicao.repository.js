const { prisma } = require('../database/prisma');

async function findAtivaByNumeroPedido(numeroPedido) {
  return prisma.expedicao.findFirst({
    where: { numeroPedido: String(numeroPedido), status: 'ativa' },
    select: { id: true }
  });
}

async function findByIdIncludeSeries(id) {
  return prisma.expedicao.findUnique({
    where: { id: String(id) },
    include: { series: true }
  });
}

async function findResumoById(id) {
  return prisma.expedicao.findUnique({
    where: { id: String(id) },
    include: {
      eventos: { orderBy: { criadoEm: 'asc' } },
      series: { include: { fotos: true } },
      fotosGerais: { orderBy: { criadoEm: 'asc' } }
    }
  });
}

async function create(data) {
  return prisma.expedicao.create({ data });
}

async function update(id, data) {
  return prisma.expedicao.update({
    where: { id: String(id) },
    data
  });
}

async function findByIdSelect(id, select) {
  return prisma.expedicao.findUnique({
    where: { id: String(id) },
    select: select || { id: true }
  });
}


module.exports = {
  findAtivaByNumeroPedido,
  findByIdIncludeSeries,
  findResumoById,
  create,
  update,
  findByIdSelect
};
