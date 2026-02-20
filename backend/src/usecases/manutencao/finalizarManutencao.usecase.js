const crypto = require('crypto');
const { prisma } = require('../../database/prisma');
const manutencaoRepo = require('../../repositories/manutencao.repository');
const { SETOR_MANUTENCAO, obterSetorPorFuncionarioAsync } = require('../../domain/setorManutencao');

function parseNumeroMedida(valor, campo) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    return { ok: true, value: undefined };
  }

  const bruto = String(valor).trim();
  if (!/^[0-9.,]+$/.test(bruto)) {
    return { ok: false, erro: `Campo '${campo}' inválido. Informe apenas números com ponto ou vírgula.` };
  }

  const normalizado = bruto.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalizado)) {
    return { ok: false, erro: `Campo '${campo}' inválido. Formato esperado: 10, 10.5 ou 10,5.` };
  }

  const numero = Number(normalizado);
  if (Number.isNaN(numero)) {
    return { ok: false, erro: `Campo '${campo}' inválido. Não foi possível converter para número.` };
  }

  return { ok: true, value: numero };
}

async function execute({ params, body }) {
  const { id } = params;
  const { funcionarioId, pesoKg, altura, largura, comprimento, observacao } = body;

  if (!id || !funcionarioId) {
    return { status: 400, body: { erro: 'id e funcionarioId são obrigatórios' } };
  }

  const setorFuncionario = await obterSetorPorFuncionarioAsync(funcionarioId);
  if (!setorFuncionario) {
    return {
      status: 403,
      body: { erro: "Funcionário sem setor configurado. Cadastre o crachá em /admin/funcionarios." }
    };
  }
  if (setorFuncionario !== SETOR_MANUTENCAO) {
    console.info('[manutencao.finalizar] bloqueado_setor', {
      manutencaoId: String(id),
      funcionarioId: String(funcionarioId).trim(),
      setorRecebido: setorFuncionario
    });
    return { status: 403, body: { erro: "Finalização permitida apenas para o setor 'manutenção'" } };
  }

  const manutencao = await manutencaoRepo.findById(String(id));
  if (!manutencao) return { status: 404, body: { erro: 'Manutenção não encontrada' } };

  if (manutencao.status !== 'embalagem' && manutencao.status !== 'descarte' && manutencao.status !== 'finalizada') {
    return {
      status: 400,
      body: { erro: `Não é possível finalizar manutenção a partir de '${manutencao.status}'` }
    };
  }

  if (manutencao.status === 'finalizada') {
    return { status: 200, body: { ok: true, status: 'finalizada', mensagem: 'Manutenção já estava finalizada' } };
  }

  const pesoParse = parseNumeroMedida(pesoKg, 'pesoKg');
  if (!pesoParse.ok) return { status: 400, body: { erro: pesoParse.erro } };
  const alturaParse = parseNumeroMedida(altura, 'altura');
  if (!alturaParse.ok) return { status: 400, body: { erro: alturaParse.erro } };
  const larguraParse = parseNumeroMedida(largura, 'largura');
  if (!larguraParse.ok) return { status: 400, body: { erro: larguraParse.erro } };
  const comprimentoParse = parseNumeroMedida(comprimento, 'comprimento');
  if (!comprimentoParse.ok) return { status: 400, body: { erro: comprimentoParse.erro } };

  try {
    const atualizado = await prisma.$transaction(async (tx) => {
      const claimed = await tx.manutencao.updateMany({
        where: { id: String(id), version: manutencao.version, status: manutencao.status },
        data: {
          status: 'finalizada',
          version: { increment: 1 },
          funcionarioAtualId: String(funcionarioId).trim(),
          dataFinalizacao: new Date(),
          pesoKg: pesoParse.value === undefined ? manutencao.pesoKg : pesoParse.value,
          altura: alturaParse.value === undefined ? manutencao.altura : alturaParse.value,
          largura: larguraParse.value === undefined ? manutencao.largura : larguraParse.value,
          comprimento: comprimentoParse.value === undefined ? manutencao.comprimento : comprimentoParse.value,
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
          setor: setorFuncionario,
          observacao: 'Manutenção finalizada'
        }
      });

      return tx.manutencao.findUnique({ where: { id: String(id) } });
    });

    if (!atualizado) {
      return {
        status: 409,
        body: {
          erro: 'Conflito de concorrência: manutenção foi alterada por outro usuário. Atualize e tente novamente.',
          code: 'CONCURRENCY_CONFLICT',
          detalhe: { recurso: 'Manutencao', manutencaoId: String(id) }
        }
      };
    }

    console.info('[manutencao.finalizar] sucesso', {
      manutencaoId: String(id),
      funcionarioId: String(funcionarioId).trim(),
      setor: setorFuncionario,
      statusNovo: atualizado.status
    });

    return {
      status: 200,
      body: {
        ok: true,
        status: 'finalizada',
        mensagem: 'Manutenção finalizada com sucesso',
        manutencao: {
          id: atualizado.id,
          numeroOS: atualizado.numeroOS,
          status: atualizado.status,
          codProdutoOmie: atualizado.codProdutoOmie,
          dataFinalizacao: atualizado.dataFinalizacao
        }
      }
    };
  } catch (err) {
    console.error('Erro finalizarManutencao:', err);
    return { status: 500, body: { erro: 'Erro interno ao finalizar manutenção' } };
  }
}

module.exports = { execute };



