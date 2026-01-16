const crypto = require('crypto');
const axios = require('axios');
const { prisma } = require('../database/prisma');
const { FLUXO_ETAPAS, TIPOS_EVENTO } = require('../domain/fluxoOp');

/* ============================
   BUSCAR OP NA API EXTERNA
============================ */
async function buscarOpNaAPI(numeroOP, empresa) {
  const appHash = empresa === 'marchi'
    ? 'marchi-01i5xgxk'
    : 'gs-01i4odn5';

  const response = await axios.post(
    'http://restrito.viaondarfid.com.br/api/produto_etiqueta.php',
    { appHash, numOrdemProducao: numeroOP }
  );

  return response.data.data?.[0] || null;
}

/* ============================
   INICIAR OP (MONTAGEM)
============================ */
const iniciarOp = async (req, res) => {
  const { numeroOP, empresa, funcionarioId } = req.body;

  if (!numeroOP || !empresa || !funcionarioId) {
    return res.status(400).json({
      erro: 'numeroOP, empresa e funcionarioId são obrigatórios'
    });
  }

  const externa = await buscarOpNaAPI(numeroOP, empresa);
  if (!externa) {
    return res.status(404).json({
      erro: 'OP não existe na API externa'
    });
  }

  let op = await prisma.ordemProducao.findFirst({
    where: { numeroOP }
  });

  if (!op) {
    op = await prisma.ordemProducao.create({
      data: {
        id: crypto.randomUUID(),
        numeroOP,
        descricaoProduto: externa.descricao_produto,
        quantidadeProduzida: Number(externa.quantidade_total),
        status: 'montagem'
      }
    });
  }

  // Evita criar dois "inicio/montagem"
  const jaIniciada = await prisma.eventoOP.findFirst({
    where: { opId: op.id, etapa: 'montagem', tipo: 'inicio' }
  });

  if (!jaIniciada) {
    await prisma.eventoOP.create({
      data: {
        id: crypto.randomUUID(),
        opId: op.id,
        tipo: 'inicio',
        etapa: 'montagem',
        funcionarioId
      }
    });
  }

  res.json({ ok: true, op });
};

/* ============================
   EVENTOS (PAUSA / RETORNO)
============================ */
const adicionarEvento = async (req, res) => {
  const { id } = req.params;
  const { tipo, funcionarioId } = req.body;

  if (!TIPOS_EVENTO.includes(tipo)) {
    return res.status(400).json({ erro: 'Tipo de evento inválido' });
  }

  if (!funcionarioId) {
    return res.status(400).json({ erro: 'funcionarioId é obrigatório' });
  }

  if (tipo === 'inicio' || tipo === 'fim') {
    return res.status(400).json({
      erro: 'Use os endpoints específicos para início ou finalização'
    });
  }

  const op = await prisma.ordemProducao.findUnique({ where: { id } });
  if (!op) {
    return res.status(404).json({ erro: 'OP não encontrada' });
  }

  const etapaAtual = op.status;

  const ultimoEvento = await prisma.eventoOP.findFirst({
    where: { opId: id, etapa: etapaAtual },
    orderBy: { criadoEm: 'desc' }
  });

  if (tipo === 'pausa') {
    if (!ultimoEvento || !['inicio', 'retorno'].includes(ultimoEvento.tipo)) {
      return res.status(400).json({
        erro: 'Só é possível pausar após início ou retorno'
      });
    }
  }

  if (tipo === 'retorno') {
    if (!ultimoEvento || ultimoEvento.tipo !== 'pausa') {
      return res.status(400).json({
        erro: 'Só é possível retornar após pausa'
      });
    }
  }

  await prisma.eventoOP.create({
    data: {
      id: crypto.randomUUID(),
      opId: id,
      tipo,
      etapa: etapaAtual,
      funcionarioId
    }
  });

  res.json({ ok: true });
};

/* ============================
   FINALIZAR ETAPA (FLUXO FORÇADO)
============================ */
const finalizarEtapa = async (req, res) => {
  const { id, etapa } = req.params;
  const { funcionarioId } = req.body;

  if (!funcionarioId)
    return res.status(400).json({ erro: 'funcionarioId é obrigatório' });

  const op = await prisma.ordemProducao.findUnique({ where: { id } });
  if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

  if (op.status !== etapa)
    return res.status(400).json({
      erro: `Não é possível finalizar ${etapa}. Etapa atual: ${op.status}`
    });

  const index = FLUXO_ETAPAS.indexOf(etapa);
  if (index === -1) return res.status(400).json({ erro: 'Etapa inválida' });

  const ultimoEvento = await prisma.eventoOP.findFirst({
    where: { opId: id, etapa },
    orderBy: { criadoEm: 'desc' }
  });

  if (!ultimoEvento || ultimoEvento.tipo === 'pausa')
    return res.status(400).json({
      erro: 'Etapa não pode ser finalizada pausada ou sem início'
    });

  const proximaEtapa = FLUXO_ETAPAS[index + 1];

  try {
    await prisma.$transaction(async (tx) => {
      // 1️⃣ Cria evento FIM da etapa atual
      await tx.eventoOP.create({
        data: {
          id: crypto.randomUUID(),
          opId: id,
          tipo: 'fim',
          etapa,
          funcionarioId
        }
      });

      // 2️⃣ Atualiza status da OP
      await tx.ordemProducao.update({
        where: { id },
        data: { status: proximaEtapa }
      });

      // 3️⃣ Cria evento INÍCIO da próxima etapa, se não for finalizada
      if (proximaEtapa && proximaEtapa !== 'finalizada') {
        await tx.eventoOP.create({
          data: {
            id: crypto.randomUUID(),
            opId: id,
            tipo: 'inicio',
            etapa: proximaEtapa,
            funcionarioId
          }
        });
      }
    });

    res.json({
      ok: true,
      etapaFinalizada: etapa,
      proximaEtapa
    });
  } catch (err) {
    console.error('Erro ao finalizar etapa:', err);
    return res.status(500).json({ erro: 'Erro interno ao finalizar etapa' });
  }
};

/* ============================
   RESUMO + TEMPO POR ETAPA
============================ */
const resumoOp = async (req, res) => {
  const { id } = req.params;

  const eventos = await prisma.eventoOP.findMany({
    where: { opId: id },
    orderBy: { criadoEm: 'asc' }
  });

  if (!eventos.length) {
    return res.status(404).json({ erro: 'OP não encontrada' });
  }

  const tempos = {};
  let inicio = null;

  for (const e of eventos) {
    if (e.tipo === 'inicio' || e.tipo === 'retorno') {
      inicio = e;
    }

    if ((e.tipo === 'pausa' || e.tipo === 'fim') && inicio) {
      const diff = new Date(e.criadoEm) - new Date(inicio.criadoEm);
      tempos[e.etapa] = (tempos[e.etapa] || 0) + diff;
      inicio = null;
    }
  }

  Object.keys(tempos).forEach(etapa => {
    tempos[etapa] = Math.round(tempos[etapa] / 1000); // segundos
  });

  res.json({ temposPorEtapa: tempos, eventos });
};

/* ============================
   Relatório de Rastreabilidade
============================ */
const rastreabilidadeOp = async (req, res) => {
  const { id } = req.params;

  const op = await prisma.ordemProducao.findUnique({
    where: { id },
    include: {
      produtosFinais: {
        include: {
          subprodutos: true
        }
      }
    }
  });

  if (!op)
    return res.status(404).json({ erro: 'OP não encontrada' });

  res.json({
    opFinal: {
      id: op.id,
      numeroOP: op.numeroOP,
      produto: op.descricaoProduto,
      quantidadePlanejada: op.quantidadeProduzida,
      status: op.status
    },
    produtosFinais: op.produtosFinais.map(pf => ({
      id: pf.id,
      serie: pf.serie,
      subprodutos: pf.subprodutos.map(sp => ({
        serie: sp.etiquetaId,
        opSubproduto: sp.opNumeroSubproduto,
        funcionario: sp.funcionarioId,
        data: sp.criadoEm
      }))
    }))
  });
};

module.exports = {
  iniciarOp,
  adicionarEvento,
  finalizarEtapa,
  resumoOp,
  rastreabilidadeOp
};
