const crypto = require('crypto');
const axios = require('axios');
const { prisma } = require('../database/prisma');
const { FLUXO_ETAPAS, TIPOS_EVENTO } = require('../domain/fluxoOp');
const { getOmieCredenciais } = require('../config/omie.config');

/* =========================
   Cache simples para BOM na OP
========================= */
const bomCache = new Map();
const CACHE_TEMPO = 5 * 60 * 1000;

async function consultarEstrutura(codProdutoOmie, empresa) {
  if (!codProdutoOmie) return null;

  const cacheKey = `${empresa}_${codProdutoOmie}`;
  const cache = bomCache.get(cacheKey);

  if (cache && Date.now() - cache.timestamp < CACHE_TEMPO) {
    return cache.data;
  }

  const { appKey, appSecret } = getOmieCredenciais(empresa);

  const resp = await axios.post(
    'https://app.omie.com.br/api/v1/geral/malha/',
    {
      call: 'ConsultarEstrutura',
      param: [{ codProduto: codProdutoOmie }],
      app_key: appKey,
      app_secret: appSecret
    },
    { timeout: 40000 }
  );

  const data = resp.data || {};
  bomCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

function extrairSubprodutosDoBOM(bomData) {
  const itens = Array.isArray(bomData?.itens) ? bomData.itens : [];

  return itens
    .filter(i => String(i.descrFamMalha || '').trim() === 'SubProduto')
    .map(i => ({
      codigo: String(i.codProdMalha || '').trim(),
      qtdPorUnidade: Number(i.quantProdMalha || 0)
    }))
    .filter(i => i.codigo && i.qtdPorUnidade > 0);
}

/* ============================
   BUSCAR OP NA API EXTERNA (ViaOnda)
============================ */
async function buscarOpNaAPI(numeroOP, empresa) {
  const appHash =
    empresa === 'marchi'
      ? 'marchi-01i5xgxk'
      : empresa === 'gs'
        ? 'gs-01i4odn5'
        : null;

  if (!appHash) throw new Error('Empresa inválida');

  const response = await axios.post(
    'http://restrito.viaondarfid.com.br/api/produto_etiqueta.php',
    { appHash, numOrdemProducao: numeroOP },
    { timeout: 30000 }
  );

  return response.data?.data?.[0] || null;
}

const iniciarOp = async (req, res) => {
  const { numeroOP, empresa, funcionarioId } = req.body;

  if (!numeroOP || !empresa || !funcionarioId) {
    return res.status(400).json({
      erro: 'numeroOP, empresa e funcionarioId são obrigatórios'
    });
  }

  const numero = String(numeroOP).trim();
  const emp = String(empresa).trim();

  let externa;
  try {
    externa = await buscarOpNaAPI(numero, emp);
  } catch (err) {
    return res.status(400).json({ erro: err.message });
  }

  if (!externa) {
    return res.status(404).json({ erro: 'OP não existe na API externa' });
  }

  let op = await prisma.ordemProducao.findFirst({ where: { numeroOP: numero } });

  // se OP já existe, não deixa trocar empresa
  if (op && op.empresa !== emp) {
    return res.status(400).json({
      erro: `OP já pertence à empresa '${op.empresa}'. Você enviou '${emp}'.`,
      op
    });
  }

  // se OP existe e já avançou, não reinicia montagem
  if (op && op.status !== 'montagem') {
    return res.status(400).json({
      erro: `OP já está em '${op.status}'. Não é possível iniciar montagem novamente.`,
      op
    });
  }

  if (!op) {
    op = await prisma.ordemProducao.create({
      data: {
        id: crypto.randomUUID(),
        numeroOP: numero,
        descricaoProduto: externa.descricao_produto || '',
        quantidadeProduzida: Number(externa.quantidade_total || 0),
        status: 'montagem',
        empresa: emp
      }
    });
  }

  const ultimoEventoMontagem = await prisma.eventoOP.findFirst({
    where: { opId: op.id, etapa: 'montagem' },
    orderBy: { criadoEm: 'desc' }
  });

  const precisaReiniciarMontagem =
    !ultimoEventoMontagem ||
    ['pausa', 'fim'].includes(ultimoEventoMontagem.tipo);

  if (precisaReiniciarMontagem) {
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

  return res.json({ ok: true, op });
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
  if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

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

  return res.json({ ok: true });
};

/* =========================
   FINALIZAR ETAPA (FLUXO FORÇADO)
   ✅ na MONTAGEM: valida SubProdutos pelo BOM (descrFamMalha === "SubProduto")
   ✅ obrigatórioTotal = qtdPorUnidade * op.quantidadeProduzida
   ✅ consumidoTotal = SUM(Subproduto.quantidade por codigoSubproduto)
   ✅ CORREÇÃO: se OP não tiver ProdutoFinal com codProdutoOmie, NÃO BLOQUEIA
   ✅ CORREÇÃO: OP “sem ProdutoFinal” (placa/subproduto) PULA embalagem_estoque:
                ao finalizar TESTE -> finalizada
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
    return res.status(400).json({
      erro: `Não é possível finalizar ${etapa}. Etapa atual: ${op.status}`
    });
  }

  const index = FLUXO_ETAPAS.indexOf(etapa);
  if (index === -1) return res.status(400).json({ erro: 'Etapa inválida' });

  const ultimoEvento = await prisma.eventoOP.findFirst({
    where: { opId: id, etapa },
    orderBy: { criadoEm: 'desc' }
  });

  if (!ultimoEvento || ultimoEvento.tipo === 'pausa') {
    return res.status(400).json({
      erro: 'Etapa não pode ser finalizada pausada ou sem início'
    });
  }

  // 🔁 próxima etapa “normal”
  let proximaEtapa = FLUXO_ETAPAS[index + 1];

  /* =====================================================
     ✅ REGRA: OP de placa/subproduto (sem ProdutoFinal)
        ao finalizar TESTE -> vai direto para FINALIZADA
        (pula embalagem_estoque)
  ====================================================== */
  if (etapa === 'teste' && proximaEtapa === 'embalagem_estoque') {
    const existePF = await prisma.produtoFinal.findFirst({
      where: { opId: id },
      select: { id: true }
    });

    if (!existePF) {
      proximaEtapa = 'finalizada';
    }
  }

  /* =====================================================
     ✅ Validação SubProduto pelo BOM (somente ao finalizar MONTAGEM)
     - Só valida se existir PF com codProdutoOmie
     - Se não existir (caso típico: OP de placa), NÃO bloqueia
  ====================================================== */
  if (etapa === 'montagem') {
    if (!op.empresa) {
      return res.status(400).json({
        erro: 'OP sem empresa definida. Salve a empresa na OP (op/iniciar) para validar BOM de subprodutos.'
      });
    }

    // pega 1 codProdutoOmie de PF
    const pf = await prisma.produtoFinal.findFirst({
      where: { opId: id },
      select: { codProdutoOmie: true }
    });

    // ✅ CORREÇÃO: OP sem ProdutoFinal/codProdutoOmie => não valida BOM e não bloqueia
    if (!pf?.codProdutoOmie) {
      console.warn(
        `[finalizarEtapa] Pulando validação BOM SubProduto: OP ${op.numeroOP} (id=${id}) sem ProdutoFinal/codProdutoOmie.`
      );
    } else {
      let bomData;
      try {
        bomData = await consultarEstrutura(pf.codProdutoOmie, op.empresa);
      } catch (err) {
        console.error(
          'Erro ConsultarEstrutura (finalizar montagem):',
          err.response?.data || err.message
        );
        return res.status(502).json({ erro: 'Falha ao consultar BOM no Omie' });
      }

      const subprodutosBOM = extrairSubprodutosDoBOM(bomData);

      // Se BOM não tem SubProduto, não obriga
      if (subprodutosBOM.length > 0) {
        // soma consumido por codigoSubproduto na OP
        const consumos = await prisma.subproduto.findMany({
          where: { opId: id },
          select: { codigoSubproduto: true, quantidade: true }
        });

        const consumidoMap = {};
        for (const c of consumos) {
          const cod = String(c.codigoSubproduto || '').trim();
          if (!cod) continue;
          consumidoMap[cod] = (consumidoMap[cod] || 0) + Number(c.quantidade || 0);
        }

        const faltando = [];

        for (const sp of subprodutosBOM) {
          const obrigatorioTotal =
            Number(sp.qtdPorUnidade || 0) * Number(op.quantidadeProduzida || 0);

          const consumidoTotal = Number(consumidoMap[sp.codigo] || 0);

          if (consumidoTotal < obrigatorioTotal) {
            faltando.push({
              codigoSubproduto: sp.codigo,
              obrigatorioTotal,
              consumidoTotal,
              faltam: obrigatorioTotal - consumidoTotal
            });
          }
        }

        if (faltando.length > 0) {
          return res.status(400).json({
            erro:
              'Não é possível finalizar a montagem: subprodutos obrigatórios incompletos (BOM família SubProduto).',
            codProdutoOmie: pf.codProdutoOmie,
            faltando
          });
        }
      }
    }
  }

  /* =========================
     FINALIZA NORMAL
  ========================= */
  try {
    await prisma.$transaction(async (tx) => {
      // fim etapa atual
      await tx.eventoOP.create({
        data: {
          id: crypto.randomUUID(),
          opId: id,
          tipo: 'fim',
          etapa,
          funcionarioId
        }
      });

      // atualiza status
      await tx.ordemProducao.update({
        where: { id },
        data: { status: proximaEtapa }
      });

      // inicio próxima etapa (se existir e não for finalizada)
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

    return res.json({
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
   RESUMO + TEMPO POR ETAPA (ROBUSTO)
   - calcula por etapa separadamente
   - não some etapas
============================ */
const resumoOp = async (req, res) => {
  const { id } = req.params;

  try {
    const eventos = await prisma.eventoOP.findMany({
      where: { opId: id },
      orderBy: { criadoEm: 'asc' }
    });

    if (!eventos.length) {
      return res.status(404).json({ erro: 'OP não encontrada' });
    }

    const temposMs = {};
    for (const etapa of FLUXO_ETAPAS) temposMs[etapa] = 0;

    const inicioPorEtapa = {}; // { [etapa]: Date | null }

    for (const e of eventos) {
      const etapa = e.etapa;
      const tipo = e.tipo;
      const t = new Date(e.criadoEm);

      if (temposMs[etapa] === undefined) temposMs[etapa] = 0;

      // abre janela
      if (tipo === 'inicio' || tipo === 'retorno') {
        if (!inicioPorEtapa[etapa]) inicioPorEtapa[etapa] = t;
        continue;
      }

      // fecha janela
      if ((tipo === 'pausa' || tipo === 'fim') && inicioPorEtapa[etapa]) {
        const diff = t - inicioPorEtapa[etapa];
        if (diff > 0) temposMs[etapa] += diff;
        inicioPorEtapa[etapa] = null;
        continue;
      }

      // ignora outros eventos (ex: consumo_subproduto)
    }

    const temposPorEtapa = {};
    for (const etapa of Object.keys(temposMs)) {
      temposPorEtapa[etapa] = Math.round(temposMs[etapa] / 1000);
    }

    return res.json({ temposPorEtapa, eventos });
  } catch (err) {
    console.error('Erro resumoOp:', err);
    return res.status(500).json({ erro: 'Erro interno ao gerar resumo' });
  }
};

/* ============================
   RASTREABILIDADE DE MATERIAIS
   ✅ inclui consumos de peças e subprodutos
   ✅ inclui "BOM obrigatório vs consumido" para SubProduto
============================ */
const rastreabilidadeMateriais = async (req, res) => {
  const { id } = req.params;

  try {
    const op = await prisma.ordemProducao.findUnique({
      where: { id },
      include: {
        produtosFinais: {
          include: {
            subprodutos: true,
            consumosPeca: true // ✅ nome correto
          }
        },
        subprodutos: true
      }
    });

    if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

    // tenta buscar BOM (para "SubProduto obrigatório vs consumido")
    let bomObrigatorio = null;

    if (op.empresa) {
      const pf = op.produtosFinais.find(x => x.codProdutoOmie) || null;
      if (pf?.codProdutoOmie) {
        try {
          const bomData = await consultarEstrutura(pf.codProdutoOmie, op.empresa);
          const subprodutosBOM = extrairSubprodutosDoBOM(bomData);

          if (subprodutosBOM.length > 0) {
            // consumido por codigoSubproduto (na OP)
            const consumidoMap = {};
            for (const sp of op.subprodutos || []) {
              const cod = String(sp.codigoSubproduto || '').trim();
              if (!cod) continue;
              consumidoMap[cod] = (consumidoMap[cod] || 0) + Number(sp.quantidade || 0);
            }

            bomObrigatorio = {
              codProdutoOmie: pf.codProdutoOmie,
              regraFamilia: 'descrFamMalha === "SubProduto"',
              itens: subprodutosBOM.map(sp => {
                const obrigatorioTotal = sp.qtdPorUnidade * Number(op.quantidadeProduzida || 0);
                const consumidoTotal = Number(consumidoMap[sp.codigo] || 0);
                return {
                  codigoSubproduto: sp.codigo,
                  qtdPorUnidade: sp.qtdPorUnidade,
                  obrigatorioTotal,
                  consumidoTotal,
                  faltam: Math.max(0, obrigatorioTotal - consumidoTotal)
                };
              })
            };
          }
        } catch (err) {
          // não quebra rastreabilidade se Omie falhar
          console.warn('Aviso: falha ao consultar BOM no Omie:', err.response?.data || err.message);
        }
      }
    }

    return res.json({
      op: {
        id: op.id,
        numeroOP: op.numeroOP,
        empresa: op.empresa || null,
        produto: op.descricaoProduto,
        quantidadePlanejada: op.quantidadeProduzida,
        status: op.status
      },
      bomObrigatorioVsConsumido: bomObrigatorio,
      produtosFinais: op.produtosFinais.map((pf) => ({
        id: pf.id,
        serie: pf.serie,
        codProdutoOmie: pf.codProdutoOmie || null,
        subprodutos: (pf.subprodutos || []).map((sp) => ({
          id: sp.id,
          etiquetaId: sp.etiquetaId || null,
          codigoSubproduto: sp.codigoSubproduto || null,
          opNumeroSubproduto: sp.opNumeroSubproduto || null,
          quantidade: sp.quantidade,
          criadoEm: sp.criadoEm
        })),
        pecasConsumidas: (pf.consumosPeca || []).map((c) => ({
          codigoPeca: c.codigoPeca,
          qrCode: c.qrCode,
          inicioEm: c.inicioEm,
          fimEm: c.fimEm,
          subprodutoId: c.subprodutoId || null
        }))
      }))
    });
  } catch (err) {
    console.error('Erro rastreabilidadeMateriais:', err);
    return res.status(500).json({ erro: 'Erro interno ao gerar rastreabilidade' });
  }
};

module.exports = {
  iniciarOp,
  adicionarEvento,
  finalizarEtapa,
  resumoOp,
  rastreabilidadeMateriais
};
