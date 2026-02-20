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

async function findResumoByNumeroPedidoEmpresa(numeroPedido, empresa) {
  return prisma.expedicao.findFirst({
    where: {
      numeroPedido: String(numeroPedido),
      empresa: String(empresa)
    },
    include: {
      eventos: { orderBy: { criadoEm: 'asc' } },
      series: { include: { fotos: true } },
      fotosGerais: { orderBy: { criadoEm: 'asc' } }
    },
    orderBy: { iniciadoEm: 'desc' }
  });
}

async function findUltimaExpedicaoBySerie(serie) {
  const serieNorm = String(serie || '').trim();
  if (!serieNorm) return null;

  const rows = await prisma.expedicao.findMany({
    where: {
      series: {
        some: { serie: serieNorm }
      }
    },
    orderBy: { iniciadoEm: 'desc' },
    take: 1,
    select: {
      id: true,
      numeroPedido: true,
      empresa: true,
      status: true,
      iniciadoEm: true
    }
  });

  return rows[0] || null;
}


module.exports = {
  findAtivaByNumeroPedido,
  findByIdIncludeSeries,
  findResumoById,
  findResumoByNumeroPedidoEmpresa,
  create,
  update,
  findByIdSelect,
  findUltimaExpedicaoBySerie
};
