const crypto = require('crypto');
const { prisma } = require('../../database/prisma');
const manutencaoRepo = require('../../repositories/manutencao.repository');
const manutencaoSerieRepo = require('../../repositories/manutencaoSerie.repository');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');
const expedicaoRepo = require('../../repositories/expedicao.repository');
const {
  consultarEtiquetaNfePorSerie,
  normalizeSerialInput
} = require('../../integrations/viaonda/viaonda.facade');
const { consultarPedidoVenda } = require('../../integrations/omie/omie.facade');
const { STATUS_TERMINAIS_MANUTENCAO } = require('../../domain/fluxoManutencao');
const { SETOR_MANUTENCAO, obterSetorPorFuncionarioAsync } = require('../../domain/setorManutencao');

function normalizeName(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function execute({ params, body }) {
  const { id } = params;
  const { serieProduto, funcionarioId } = body;

  if (!id || !serieProduto || !funcionarioId) {
    return { status: 400, body: { erro: 'id, serieProduto e funcionarioId são obrigatórios' } };
  }

  const setorFuncionario = await obterSetorPorFuncionarioAsync(funcionarioId);
  if (!setorFuncionario) {
    return {
      status: 403,
      body: { erro: "Funcionário sem setor configurado. Cadastre o crachá em /admin/funcionarios." }
    };
  }
  if (setorFuncionario !== SETOR_MANUTENCAO) {
    console.info('[manutencao.scan_serie] bloqueado_setor', {
      manutencaoId: String(id),
      funcionarioId: String(funcionarioId).trim(),
      setorRecebido: setorFuncionario
    });
    return {
      status: 403,
      body: { erro: "Scan de série permitido apenas para o setor 'manutenção'" }
    };
  }

  const manutencao = await manutencaoRepo.findById(String(id));
  if (!manutencao) return { status: 404, body: { erro: 'Manutenção não encontrada' } };

  if (STATUS_TERMINAIS_MANUTENCAO.includes(manutencao.status)) {
    return { status: 400, body: { erro: `Manutenção já encerrada em '${manutencao.status}'` } };
  }

  const serie = normalizeSerialInput(serieProduto);
  if (!serie) return { status: 400, body: { erro: 'serieProduto inválida' } };

  const etiquetaNfe = await consultarEtiquetaNfePorSerie(serie);
  if (!etiquetaNfe) {
    return {
      status: 400,
      body: { erro: 'Série não encontrada na consulta NFe/Etiqueta (ViaOnda)', serieProduto: serie }
    };
  }

  const codProdutoViaSerie = String(etiquetaNfe.codProdutoOmie || '').trim();
  if (!codProdutoViaSerie) {
    return {
      status: 400,
      body: { erro: 'A consulta de série não retornou código do produto', serieProduto: serie }
    };
  }

  const codAtual = String(manutencao.codProdutoOmie || '').trim();
  const codCabecalho = codAtual || codProdutoViaSerie;
  const pf = await produtoFinalRepo.findBySerie(serie);
  const codProdutoResposta = codProdutoViaSerie;

  const jaNaMesmaManutencao = await manutencaoSerieRepo.findByManutencaoIdAndSerie(String(id), serie);
  if (jaNaMesmaManutencao) {
    return {
      status: 200,
      body: {
        ok: true,
        aviso: 'Série já estava vinculada nesta manutenção',
        manutencao: {
          id: manutencao.id,
          numeroOS: manutencao.numeroOS,
          status: manutencao.status,
          serie: jaNaMesmaManutencao.serie,
          codProduto: codProdutoResposta,
          descricaoProduto: etiquetaNfe.descricaoProduto || null
        }
      }
    };
  }

  const ativoMesmaSerie = await manutencaoRepo.findAtivaBySerieExcluindoId(serie, String(id));
  if (ativoMesmaSerie) {
    return {
      status: 400,
      body: {
        erro: 'Já existe manutenção ativa para esta série',
        manutencaoAtiva: {
          id: ativoMesmaSerie.id,
          numeroOS: ativoMesmaSerie.numeroOS,
          status: ativoMesmaSerie.status,
          serie
        }
      }
    };
  }

  const ultimaExpedicao = await expedicaoRepo.findUltimaExpedicaoBySerie(serie);
  if (!ultimaExpedicao) {
    return {
      status: 400,
      body: {
        erro: 'Série sem histórico de expedição. Não é permitido abrir rastreabilidade de manutenção antes da expedição.',
        serieProduto: serie
      }
    };
  }

  if (String(ultimaExpedicao.status || '').trim() !== 'finalizada') {
    return {
      status: 400,
      body: {
        erro: 'Série com expedição ainda não finalizada. Finalize a expedição para seguir com manutenção.',
        serieProduto: serie,
        numeroPedidoUltimaExpedicao: ultimaExpedicao.numeroPedido,
        statusExpedicao: ultimaExpedicao.status || null
      }
    };
  }

  if (ultimaExpedicao?.numeroPedido && ultimaExpedicao?.empresa) {
    const pedido = await consultarPedidoVenda(ultimaExpedicao.numeroPedido, ultimaExpedicao.empresa);
    const clienteExpedicao = String(pedido?.cliente || '').trim();
    const clienteManutencao = String(manutencao.clienteNome || '').trim();

    if (clienteExpedicao && clienteManutencao) {
      const sameClient = normalizeName(clienteExpedicao) === normalizeName(clienteManutencao);
      if (!sameClient) {
        return {
          status: 400,
          body: {
            erro: 'Série pertence à expedição de outro cliente',
            serieProduto: serie,
            clienteOSManutencao: clienteManutencao,
            clienteUltimaExpedicao: clienteExpedicao,
            numeroPedidoUltimaExpedicao: ultimaExpedicao.numeroPedido
          }
        };
      }
    }
  }

  const atualizado = await prisma.$transaction(async (tx) => {
    await tx.manutencaoSerie.create({
      data: {
        id: crypto.randomUUID(),
        manutencaoId: String(id),
        serie,
        codProdutoOmie: codProdutoViaSerie,
        serieProdFinalId: pf?.id || null
      }
    });

    const updated = await tx.manutencao.update({
      where: { id: String(id) },
      data: {
        codProdutoOmie: codCabecalho,
        serieProdFinalId: pf?.id || null,
        funcionarioAtualId: String(funcionarioId).trim()
      }
    });

    await tx.manutencaoEvento.create({
      data: {
        id: crypto.randomUUID(),
        manutencaoId: String(id),
        tipo: 'scan_serie',
        funcionarioId: String(funcionarioId).trim(),
        setor: setorFuncionario,
        observacao: `Série vinculada: ${serie}`
      }
    });

    return updated;
  });

  console.info('[manutencao.scan_serie] sucesso', {
    manutencaoId: String(id),
    funcionarioId: String(funcionarioId).trim(),
    setor: setorFuncionario,
    serie,
    codProduto: codProdutoResposta
  });

  return {
    status: 200,
    body: {
      ok: true,
      mensagem: 'Série vinculada na manutenção',
      manutencao: {
        id: atualizado.id,
        numeroOS: atualizado.numeroOS,
        status: atualizado.status,
        serie,
        codProduto: codProdutoResposta,
        descricaoProduto: etiquetaNfe.descricaoProduto || null
      }
    }
  };
}

module.exports = { execute };



