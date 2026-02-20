const { prisma } = require('../database/prisma');

async function findById(id) {
  return prisma.funcionario.findUnique({
    where: { id: String(id) }
  });
}

async function findByCracha(cracha) {
  const c = String(cracha || '').trim();
  if (!c) return null;

  return prisma.funcionario.findFirst({
    where: { cracha: c }
  });
}

async function findManyByCracha(crachas) {
  const lista = Array.from(
    new Set((crachas || []).map((c) => String(c || '').trim()).filter(Boolean))
  );
  if (!lista.length) return [];

  return prisma.funcionario.findMany({
    where: {
      cracha: {
        in: lista
      }
    }
  });
}

async function list() {
  return prisma.funcionario.findMany({
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }]
  });
}

async function create(data) {
  return prisma.funcionario.create({ data });
}

async function update(id, data) {
  return prisma.funcionario.update({
    where: { id: String(id) },
    data
  });
}

async function remove(id) {
  return prisma.funcionario.delete({
    where: { id: String(id) }
  });
}

module.exports = {
  findById,
  findByCracha,
  findManyByCracha,
  list,
  create,
  update,
  remove
};
