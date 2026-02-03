const crypto = require('crypto');
const axios = require('axios');
const { prisma } = require('../database/prisma');
const { FLUXO_ETAPAS, TIPOS_EVENTO } = require('../domain/fluxoOp');
const { getOmieCredenciais } = require('../config/omie.config');

/* =========================
   BUSCAR OP NA API EXTERNA (ViaOnda)
========================= */
async function buscarOpNaAPI(numeroOP, empresa) {
  const appHash =
    empresa === 'marchi'
      ? 'marchi-01i5xgxk'
      : 'gs-01i4odn5';

  try {
    const response = await axios.post(
      'http://restrito.viaondarfid.com.br/api/produto_etiqueta.php',
      {
        appHash,
        numOrdemProducao: numeroOP
      },
      { timeout: 40000 }
    );

    return response.data?.data?.[0] || null;

  } catch (err) {
    console.error('Erro: ViaOnda/Marchi buscarOpNaAPI:', err.message);
    return null;
  }
}

/* =========================
   BUSCAR nCodOP NO OMIE (fallback)
========================= */
async function buscarOpNoOmie(numeroOP, empresa) {
  const { appKey, appSecret } = getOmieCredenciais(empresa);

  try {
    const response = await axios.post(
      'https://app.omie.com.br/api/v1/produtos/op/',
      {
        call: 'ConsultarOrdemProducao',
        param: [{
          // ✅ IMPORTANTE: o método ConsultarOrdemProducao consulta por:
          // - nCodOP (código interno no Omie) OU
          // - cCodIntOP (código de integração).
          // Ele NÃO aceita cNumOP (isso causa o erro: Tag [CNUMOP] ... copConsultarRequest).
          // Aqui usamos o número da OP como código de integração.
          cCodIntOP: String(numeroOP),
          nCodOP: 0
        }],
        app_key: appKey,
        app_secret: appSecret
      },
      { timeout: 40000 }
    );

    return response.data?.identificacao?.nCodOP || null;

  } catch (err) {
    console.error('Erro: Omie buscarOpNoOmie:', err.response?.data || err.message);
    return null;
  }
}

/* =========================
   INICIAR OP (MONTAGEM)
========================= */
const iniciarOp = async (req, res) => {
  const { numeroOP, empresa, funcionarioId, nCodOP } = req.body;

  if (!numeroOP || !empresa || !funcionarioId) {
    return res.status(400).json({
      erro: 'numeroOP, empresa e funcionarioId são obrigatórios'
    });
  }

  /* 🔹 ViaOnda (origem da OP) */
  const externa = await buscarOpNaAPI(numeroOP, empresa);

  if (!externa) {
    return res.status(502).json({
      erro: 'Falha ao consultar OP no sistema externo (ViaOnda)'
    });
  }

  let op = await prisma.ordemProducao.findUnique({
    where: { numeroOP }
  });

  if (!op) {
    op = await prisma.ordemProducao.create({
      data: {
        id: crypto.randomUUID(),
        numeroOP,
        descricaoProduto: externa.descricao_produto,
        quantidadeProduzida: Number(externa.quantidade_total),
        status: 'montagem',
        nCodOP: nCodOP ? BigInt(nCodOP) : null
      }
    });
  }

  /* 🔹 Se ainda não tem nCodOP, tenta Omie (fallback) */
  if (!op.nCodOP) {
    const nCodOmie = nCodOP || await buscarOpNoOmie(numeroOP, empresa);

    if (!nCodOmie) {
      return res.status(502).json({
        erro: 'Não foi possível obter o código da OP no Omie (nCodOP)'
      });
    }

    op = await prisma.ordemProducao.update({
      where: { id: op.id },
      data: { nCodOP: BigInt(nCodOmie) }
    });
  }

  if (op.status !== 'montagem') {
    return res.status(400).json({
      erro: 'OP já saiu da etapa de montagem'
    });
  }

  /* 🔹 Evento de início (idempotente) */
  const jaIniciada = await prisma.eventoOP.findFirst({
    where: {
      opId: op.id,
      etapa: 'montagem',
      tipo: 'inicio'
    }
  });

  if (!jaIniciada) {
    await prisma.eventoOP.create({
      data: {
        id: crypto.randomUUID(),
        opId: op.id,
        etapa: 'montagem',
        tipo: 'inicio',
        funcionarioId
      }
    });
  }

  return res.json({
  ok: true,
  op: {...op, nCodOP: op.nCodOP ? op.nCodOP.toString() : null}});
};

/* =========================
   EVENTOS (PAUSA / RETORNO)
========================= */
const adicionarEvento = async (req, res) => {
  const { id } = req.params;
  const { tipo, funcionarioId } = req.body;

  if (!TIPOS_EVENTO.includes(tipo)) {
    return res.status(400).json({ erro: 'Tipo de evento inválido' });
  }

  if (!funcionarioId) {
    return res.status(400).json({ erro: 'funcionarioId é obrigatório' });
  }

  if (['inicio', 'fim'].includes(tipo)) {
    return res.status(400).json({
      erro: 'Use endpoints específicos para início ou finalização'
    });
  }

  const op = await prisma.ordemProducao.findUnique({ where: { id } });
  if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

  const etapaAtual = op.status;

  const ultimoEvento = await prisma.eventoOP.findFirst({
    where: { opId: id, etapa: etapaAtual },
    orderBy: { criadoEm: 'desc' }
  });

  if (tipo === 'pausa' && (!ultimoEvento || !['inicio', 'retorno'].includes(ultimoEvento.tipo))) {
    return res.status(400).json({ erro: 'Pausa inválida' });
  }

  if (tipo === 'retorno' && (!ultimoEvento || ultimoEvento.tipo !== 'pausa')) {
    return res.status(400).json({ erro: 'Retorno inválido' });
  }

  await prisma.eventoOP.create({
    data: {
      id: crypto.randomUUID(),
      opId: id,
      etapa: etapaAtual,
      tipo,
      funcionarioId
    }
  });

  return res.json({ ok: true });
};

/* =========================
   FINALIZAR ETAPA
========================= */
const finalizarEtapa = async (req, res) => {
  const { id, etapa } = req.params;
  const { funcionarioId } = req.body;

  if (!funcionarioId) {
    return res.status(400).json({ erro: 'funcionarioId é obrigatório' });
  }

  const op = await prisma.ordemProducao.findUnique({ where: { id } });
  if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

  if (op.status !== etapa) {
    return res.status(400).json({ erro: 'Etapa incorreta' });
  }

  const index = FLUXO_ETAPAS.indexOf(etapa);
  const proximaEtapa = FLUXO_ETAPAS[index + 1];

  await prisma.$transaction(async (tx) => {
    await tx.eventoOP.create({
      data: {
        id: crypto.randomUUID(),
        opId: id,
        etapa,
        tipo: 'fim',
        funcionarioId
      }
    });

    await tx.ordemProducao.update({
      where: { id },
      data: { status: proximaEtapa }
    });

    if (proximaEtapa && proximaEtapa !== 'finalizada') {
      await tx.eventoOP.create({
        data: {
          id: crypto.randomUUID(),
          opId: id,
          etapa: proximaEtapa,
          tipo: 'inicio',
          funcionarioId
        }
      });
    }
  });

  return res.json({ ok: true, etapaFinalizada: etapa, proximaEtapa });
};

/* =========================
   RESUMO
========================= */
const resumoOp = async (req, res) => {
  const { id } = req.params;

  const eventos = await prisma.eventoOP.findMany({
    where: { opId: id },
    orderBy: { criadoEm: 'asc' }
  });

  if (!eventos.length) {
    return res.status(404).json({ erro: 'OP não encontrada' });
  }

  return res.json({ eventos });
};

/* =========================
   RASTREABILIDADE
========================= */
const rastreabilidadeMateriais = async (req, res) => {
  const { id } = req.params;

  const op = await prisma.ordemProducao.findUnique({
    where: { id },
    include: {
      subprodutos: {
        include: { consumosPeca: true }
      }
    }
  });

  if (!op) {
    return res.status(404).json({ erro: 'OP não encontrada' });
  }

  return res.json({
    op: {
      id: op.id,
      numeroOP: op.numeroOP,
      nCodOP: op.nCodOP ? op.nCodOP.toString() : null,
      produto: op.descricaoProduto,
      quantidade: op.quantidadeProduzida,
      status: op.status
    },
    subprodutos: op.subprodutos
  });
};

module.exports = {
  iniciarOp,
  adicionarEvento,
  finalizarEtapa,
  resumoOp,
  rastreabilidadeMateriais
};
