const { prisma } = require('../database/prisma');

async function create(data) {
  return prisma.manutencaoPecaTrocada.create({ data });
}

async function findAtivaPorCodigo({ manutencaoId, codigoPeca }) {
  return prisma.manutencaoPecaTrocada.findFirst({
    where: {
      manutencaoId: String(manutencaoId),
      codigoPeca: String(codigoPeca),
      fimEm: null
    },
    orderBy: { criadoEm: 'desc' }
  });
}

async function encerrarAtivaPorId(id, fimEm = new Date()) {
  return prisma.manutencaoPecaTrocada.update({
    where: { id: String(id) },
    data: { fimEm }
  });
}

async function findQrAtivo(qrCode) {
  const qr = String(qrCode || '').trim();
  if (!qr) return null;

  return prisma.manutencaoPecaTrocada.findFirst({
    where: { qrCode: qr, fimEm: null }
  });
}

async function findQrIdAtivo(qrId) {
  const id = String(qrId || '').trim();
  if (!id) return null;

  return prisma.manutencaoPecaTrocada.findFirst({
    where: { qrId: id, fimEm: null }
  });
}

async function findQrIdAny(qrId) {
  const id = String(qrId || '').trim();
  if (!id) return null;

  return prisma.manutencaoPecaTrocada.findFirst({
    where: { qrId: id }
  });
}

async function existeHistoricoComQr(codigoPeca) {
  const codigo = String(codigoPeca || '').trim();
  if (!codigo) return false;

  const row = await prisma.manutencaoPecaTrocada.findFirst({
    where: {
      codigoPeca: codigo,
      OR: [
        { qrCode: { not: '' } },
        { qrId: { not: '' } }
      ]
    },
    select: { id: true }
  });

  return Boolean(row);
}

module.exports = {
  create,
  findAtivaPorCodigo,
  encerrarAtivaPorId,
  findQrAtivo,
  findQrIdAtivo,
  findQrIdAny,
  existeHistoricoComQr
};
