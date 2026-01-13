const crypto = require('crypto');
const { prisma } = require('../database/prisma');
const axios = require('axios');

/* =====================================================
   VALIDAÇÃO DE FLUXO POR FUNCIONÁRIO / ETAPA
===================================================== */
function validarEvento(eventos, funcionarioId, etapa, novoTipo) {
  const eventosFiltrados = eventos
    .filter(e => e.funcionarioId === funcionarioId && e.etapa === etapa)
    .sort((a, b) => b.timestamp - a.timestamp);

  const ultimo = eventosFiltrados[0];
  const ultimoTipo = ultimo?.tipo;

  if (!ultimo && novoTipo !== 'inicio') return 'Primeiro evento da etapa deve ser "inicio"';
  if (ultimoTipo === 'inicio' && novoTipo === 'inicio') return 'Etapa já iniciada';
  if (ultimoTipo !== 'inicio' && novoTipo === 'pausa') return 'Não é possível pausar sem estar em atividade';
  if (ultimoTipo !== 'pausa' && novoTipo === 'retorno') return 'Retorno só é permitido após pausa';
  if (!['inicio', 'retorno'].includes(ultimoTipo) && novoTipo === 'fim') return 'Não é possível finalizar sem estar em atividade';
  if (ultimoTipo === 'fim') return 'Etapa já finalizada';

  return null;
}

/* =====================================================
   FUNÇÃO AUXILIAR PARA VALIDAR ETIQUETA NA API EXTERNA
===================================================== */
async function validarEtiquetaNaAPI(opNumero, etiquetaId, empresa) {
  const appHash = empresa === 'marchi' ? 'marchi-01i5xgxk' : 'gs-01i4odn5';
  try {
    const response = await axios.post(
      'http://restrito.viaondarfid.com.br/api/reimprimir_etiqueta.php',
      { appHash, numOrdemProducao: opNumero }
    );

    const etiquetasDaAPI = response.data.etiquetas || [];
    return etiquetasDaAPI.some(e => e.etiquetaId === etiquetaId);
  } catch (err) {
    console.error('Erro ao consultar API de etiquetas:', err.message);
    throw new Error('Falha na validação da etiqueta na API externa');
  }
}

/* =====================================================
   CRIAR OP (com início automático da montagem)
===================================================== */
const criarOp = async (req, res) => {
  const { produto, quantidade, numeroOP, funcionarioId } = req.body;
  if (!produto) return res.status(400).json({ erro: 'produto é obrigatório' });

  try {
    const opId = crypto.randomUUID();
    const op = await prisma.ordemProducao.create({
      data: {
        id: opId,
        numeroOP: numeroOP || null,
        produto,
        quantidade: quantidade || 0,
        status: 'montagem',
        criadoEm: new Date(),
      },
    });

    await prisma.eventoOP.create({
      data: {
        id: crypto.randomUUID(),
        opId,
        tipo: 'inicio',
        etapa: 'montagem',
        funcionarioId: funcionarioId || 'sistema',
        dados: {},
        timestamp: new Date(),
      },
    });

    return res.status(201).json(op);
  } catch (err) {
    console.error("ERRO CRIAR OP:", err);
    return res.status(500).json({ erro: 'Erro ao criar OP', detalhes: err.message });
  }
};

/* =====================================================
   ADICIONAR EVENTO GENÉRICO
===================================================== */
const adicionarEvento = async (req, res) => {
  const { id } = req.params;
  const { tipo, etapa, funcionarioId, dados } = req.body;

  if (!tipo || !etapa || !funcionarioId)
    return res.status(400).json({ erro: 'tipo, etapa e funcionarioId são obrigatórios' });

  try {
    const op = await prisma.ordemProducao.findUnique({ where: { id } });
    if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

    const eventos = await prisma.eventoOP.findMany({ where: { opId: id } });
    const erro = validarEvento(eventos, funcionarioId, etapa, tipo);
    if (erro) return res.status(400).json({ erro });

    await prisma.eventoOP.create({
      data: {
        id: crypto.randomUUID(),
        opId: id,
        tipo,
        etapa,
        funcionarioId,
        dados: dados || {},
        timestamp: new Date(),
      },
    });

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao adicionar evento', detalhes: err.message });
  }
};

/* =====================================================
   FINALIZAR ETAPA (Montagem, Teste ou Embalagem)
===================================================== */
const finalizarEtapa = async (req, res) => {
  const { id, etapa } = req.params;
  const { funcionarioId, quantidadeProduzida, subprodutos } = req.body;

  if (!funcionarioId) return res.status(400).json({ erro: 'funcionarioId é obrigatório' });

  try {
    const op = await prisma.ordemProducao.findUnique({ where: { id } });
    if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

    if (op.status !== etapa) return res.status(400).json({ erro: `OP não está na etapa ${etapa}` });

    const registros = [];

    if (Array.isArray(subprodutos)) {
      for (const sp of subprodutos) {
        // Garantir quantidade Int
        const quantidade = Number(sp.quantidade ?? 1);
        if (!sp.etiquetaId || !sp.tipo || !quantidade || !sp.empresa) {
          return res.status(400).json({ erro: 'Subproduto exige etiquetaId, tipo, quantidade e empresa' });
        }

        // Verifica duplicidade
        const existente = await prisma.subproduto.findUnique({ where: { etiquetaId: sp.etiquetaId } });
        if (existente)
          return res.status(400).json({ erro: `Etiqueta ${sp.etiquetaId} já registrada` });

        // Validação API externa
        const valida = await validarEtiquetaNaAPI(op.numeroOP, sp.etiquetaId, sp.empresa);
        if (!valida) return res.status(400).json({ erro: `Etiqueta ${sp.etiquetaId} não pertence à OP ou não existe na API` });

        // Criar subproduto
        const registro = await prisma.subproduto.create({
          data: {
            id: crypto.randomUUID(),
            opId: id,
            etiquetaId: sp.etiquetaId,
            tipo: sp.tipo,
            quantidade,
            funcionarioId,
            criadoEm: new Date(),
          },
        });
        registros.push(registro);
      }
    }

    await prisma.eventoOP.create({
      data: {
        id: crypto.randomUUID(),
        opId: id,
        tipo: 'fim',
        etapa,
        funcionarioId,
        dados: {
          quantidadeProduzida,
          subprodutos: registros.map(r => r.etiquetaId),
        },
        timestamp: new Date(),
      },
    });

    const ordem = ['montagem', 'teste', 'embalagem_estoque', 'finalizada'];
    const proxEtapa = ordem[ordem.indexOf(etapa) + 1] || 'finalizada';

    await prisma.ordemProducao.update({
      where: { id },
      data: { status: proxEtapa },
    });

    return res.json({ ok: true, proximaEtapa: proxEtapa, subprodutosVinculados: registros.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao finalizar etapa', detalhes: err.message });
  }
};

/* =====================================================
   RESUMO DA OP
===================================================== */
const resumoOp = async (req, res) => {
  const { id } = req.params;

  try {
    const op = await prisma.ordemProducao.findUnique({ where: { id } });
    if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

    const eventos = await prisma.eventoOP.findMany({ where: { opId: id } });

    const funcionarios = new Set();
    const tempos = {};
    const porFuncionarioEtapa = {};

    for (const e of eventos) {
      funcionarios.add(e.funcionarioId);
      const chave = `${e.funcionarioId}_${e.etapa}`;
      porFuncionarioEtapa[chave] = porFuncionarioEtapa[chave] || [];
      porFuncionarioEtapa[chave].push(e);
    }

    for (const chave in porFuncionarioEtapa) {
      const evs = porFuncionarioEtapa[chave].sort((a, b) => a.timestamp - b.timestamp);
      const inicio = evs.find(e => e.tipo === 'inicio');
      const fim = evs.find(e => e.tipo === 'fim');
      if (inicio && fim) {
        const etapa = inicio.etapa;
        tempos[etapa] = (tempos[etapa] || 0) + (fim.timestamp - inicio.timestamp);
      }
    }

    return res.json({
      opId: op.id,
      produto: op.produto,
      quantidade: op.quantidade,
      status: op.status,
      funcionarios: Array.from(funcionarios),
      tempos,
      totalEventos: eventos.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao gerar resumo da OP', detalhes: err.message });
  }
};

module.exports = {
  criarOp,
  adicionarEvento,
  finalizarEtapa,
  resumoOp,
};
