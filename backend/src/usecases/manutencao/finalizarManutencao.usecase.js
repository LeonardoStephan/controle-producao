const crypto = require('crypto');
const { prisma } = require('../../database/prisma');
const manutencaoRepo = require('../../repositories/manutencao.repository');

async function execute({ params, body }) {
  const { id } = params;
  const { funcionarioId, pesoKg, volumeM3, observacao } = body;

  if (!id || !funcionarioId) {
    return { status: 400, body: { erro: 'id e funcionarioId sao obrigatorios' } };
  }

  const manutencao = await manutencaoRepo.findById(String(id));
  if (!manutencao) return { status: 404, body: { erro: 'Manutencao nao encontrada' } };

  if (manutencao.status !== 'aguardando_envio' && manutencao.status !== 'finalizada') {
    return {
      status: 400,
      body: { erro: `Nao e possivel finalizar manutencao a partir de '${manutencao.status}'` }
    };
  }

  if (manutencao.status === 'finalizada') {
    return { status: 200, body: { ok: true, status: 'finalizada', mensagem: 'Manutencao ja estava finalizada' } };
  }

  if (manutencao.emGarantia === false && manutencao.aprovadoOrcamento !== true) {
    return {
      status: 400,
      body: {
        erro: 'Nao e possivel finalizar manutencao fora de garantia sem aprovacao de orcamento'
      }
    };
  }

  try {
    const atualizado = await prisma.$transaction(async (tx) => {
      const claimed = await tx.manutencao.updateMany({
        where: { id: String(id), version: manutencao.version, status: manutencao.status },
        data: {
          status: 'finalizada',
          version: { increment: 1 },
          funcionarioAtualId: String(funcionarioId).trim(),
          dataFinalizacao: new Date(),
          pesoKg: pesoKg === undefined ? manutencao.pesoKg : Number(pesoKg),
          volumeM3: volumeM3 === undefined ? manutencao.volumeM3 : Number(volumeM3),
          observacao: observacao === undefined ? manutencao.observacao : String(observacao || '')
        }
      });

      if (claimed.count === 0) return null;

      await tx.manutencaoEvento.create({
        data: {
          id: crypto.randomUUID(),
          manutencaoId: String(id),
          tipo: 'fim',
          funcionarioId: String(funcionarioId).trim(),
          observacao: 'Manutencao finalizada'
        }
      });

      return tx.manutencao.findUnique({ where: { id: String(id) } });
    });

    if (!atualizado) {
      return {
        status: 409,
        body: {
          erro: 'Conflito de concorrencia: manutencao foi alterada por outro usuario. Atualize e tente novamente.',
          code: 'CONCURRENCY_CONFLICT',
          detalhe: { recurso: 'Manutencao', manutencaoId: String(id) }
        }
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        status: 'finalizada',
        mensagem: 'Manutencao finalizada com sucesso',
        manutencao: atualizado
      }
    };
  } catch (err) {
    console.error('Erro finalizarManutencao:', err);
    return { status: 500, body: { erro: 'Erro interno ao finalizar manutencao' } };
  }
}

module.exports = { execute };
