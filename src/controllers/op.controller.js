const crypto = require('crypto');
const { prisma } = require('../database/prisma');

/* =====================================================
   VALIDAÇÃO DE FLUXO POR FUNCIONÁRIO / ETAPA
   ===================================================== */
function validarEvento(eventos, funcionarioId, etapa, novoTipo) {
  const eventosFiltrados = eventos
    .filter(e => e.funcionario_id === funcionarioId && e.etapa === etapa)
    .sort((a, b) => b.criado_em - a.criado_em);

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
   CONTROLE DE ESTADO DA OP
   ===================================================== */
function proximaEtapa(etapaAtual) {
  const ordem = ['montagem', 'teste', 'embalagem_estoque', 'finalizada'];
  const index = ordem.indexOf(etapaAtual);
  return ordem[index + 1] || 'finalizada';
}

/* =====================================================
   CRIAR OP
   ===================================================== */
const criarOp = async (req, res) => {
  const { produto, quantidade, numeroOP } = req.body;
  if (!produto) return res.status(400).json({ erro: 'produto é obrigatório' });

  const id = crypto.randomUUID();

  try {
    const op = await prisma.ordens_producao.create({
      data: {
        id,
        numero_op: numeroOP || null,
        produto,
        quantidade: quantidade || 0,
        status: 'montagem',
      },
    });
    return res.status(201).json(op);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao criar OP' });
  }
};

/* =====================================================
   ADICIONAR EVENTO
   ===================================================== */
const adicionarEvento = async (req, res) => {
  const { id } = req.params;
  const { tipo, etapa, funcionarioId, dados } = req.body;

  if (!tipo || !etapa || !funcionarioId)
    return res.status(400).json({ erro: 'tipo, etapa e funcionarioId são obrigatórios' });

  try {
    const op = await prisma.ordens_producao.findUnique({ where: { id } });
    if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

    if (op.status !== etapa)
      return res.status(400).json({ erro: `OP está na etapa "${op.status}", não em "${etapa}"` });

    const eventos = await prisma.eventos_op.findMany({ where: { op_id: id } });
    const erro = validarEvento(eventos, funcionarioId, etapa, tipo);
    if (erro) return res.status(400).json({ erro });

    await prisma.eventos_op.create({
      data: {
        op_id: id,
        tipo,
        etapa,
        funcionario_id: funcionarioId,
        dados: dados || {},
      },
    });

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao adicionar evento' });
  }
};

/* =====================================================
   FINALIZAR MONTAGEM
   ===================================================== */
const finalizarMontagem = async (req, res) => {
  const { id } = req.params;
  const { funcionarioId, quantidadeProduzida, subprodutos } = req.body;

  if (!funcionarioId || quantidadeProduzida == null)
    return res.status(400).json({ erro: 'funcionarioId e quantidadeProduzida são obrigatórios' });

  try {
    const op = await prisma.ordens_producao.findUnique({ where: { id } });
    if (!op) return res.status(404).json({ erro: 'OP não encontrada' });
    if (op.status !== 'montagem') return res.status(400).json({ erro: 'OP não está em montagem' });

    const registros = [];

    if (Array.isArray(subprodutos)) {
      for (const sp of subprodutos) {
        if (!sp.etiquetaId || !sp.tipo || !sp.quantidade)
          return res.status(400).json({ erro: 'Subproduto exige etiquetaId, tipo e quantidade' });

        const registro = await prisma.subprodutos.create({
          data: {
            op_id: id,
            etiqueta_id: sp.etiquetaId,
            tipo: sp.tipo,
            quantidade: sp.quantidade,
            funcionario_id: funcionarioId,
          },
        });
        registros.push(registro);
      }
    }

    await prisma.eventos_op.create({
      data: {
        op_id: id,
        tipo: 'fim',
        etapa: 'montagem',
        funcionario_id: funcionarioId,
        dados: { quantidadeProduzida, subprodutos: registros.map(r => r.etiqueta_id) },
      },
    });

    await prisma.ordens_producao.update({
      where: { id },
      data: { status: 'teste' },
    });

    return res.json({ ok: true, proximaEtapa: 'teste', subprodutosVinculados: registros.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao finalizar montagem' });
  }
};

/* =====================================================
   FINALIZAR TESTE
   ===================================================== */
const finalizarTeste = async (req, res) => {
  const { id } = req.params;
  const { funcionarioId } = req.body;

  if (!funcionarioId) return res.status(400).json({ erro: 'funcionarioId é obrigatório' });

  try {
    const op = await prisma.ordens_producao.findUnique({ where: { id } });
    if (!op) return res.status(404).json({ erro: 'OP não encontrada' });
    if (op.status !== 'teste') return res.status(400).json({ erro: 'OP não está em teste' });

    await prisma.eventos_op.create({
      data: { op_id: id, tipo: 'fim', etapa: 'teste', funcionario_id: funcionarioId, dados: {} },
    });

    await prisma.ordens_producao.update({ where: { id }, data: { status: 'embalagem_estoque' } });

    return res.json({ ok: true, proximaEtapa: 'embalagem_estoque' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao finalizar teste' });
  }
};

/* =====================================================
   FINALIZAR EMBALAGEM (ESTOQUE)
   ===================================================== */
const finalizarEmbalagemEstoque = async (req, res) => {
  const { id } = req.params;
  const { funcionarioId, etiquetas } = req.body;

  if (!funcionarioId) return res.status(400).json({ erro: 'funcionarioId é obrigatório' });

  try {
    const op = await prisma.ordens_producao.findUnique({ where: { id } });
    if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

    await prisma.eventos_op.create({
      data: { op_id: id, tipo: 'fim', etapa: 'embalagem_estoque', funcionario_id: funcionarioId, dados: { etiquetas: etiquetas || [] } },
    });

    await prisma.ordens_producao.update({ where: { id }, data: { status: 'finalizada' } });

    return res.json({ ok: true, statusFinal: 'finalizada' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao finalizar embalagem' });
  }
};

/* =====================================================
   RESUMO DA OP
   ===================================================== */
const resumoOp = async (req, res) => {
  const { id } = req.params;

  try {
    const op = await prisma.ordens_producao.findUnique({ where: { id } });
    if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

    const eventos = await prisma.eventos_op.findMany({ where: { op_id: id } });

    const funcionarios = new Set();
    const tempos = {};
    const porFuncionarioEtapa = {};

    for (const e of eventos) {
      funcionarios.add(e.funcionario_id);
      const chave = `${e.funcionario_id}_${e.etapa}`;
      porFuncionarioEtapa[chave] = porFuncionarioEtapa[chave] || [];
      porFuncionarioEtapa[chave].push(e);
    }

    for (const chave in porFuncionarioEtapa) {
      const evs = porFuncionarioEtapa[chave].sort((a, b) => a.criado_em - b.criado_em);
      const inicio = evs.find(e => e.tipo === 'inicio');
      const fim = evs.find(e => e.tipo === 'fim');
      if (inicio && fim) {
        const etapa = inicio.etapa;
        tempos[etapa] = (tempos[etapa] || 0) + (fim.criado_em - inicio.criado_em);
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
    return res.status(500).json({ erro: 'Erro ao gerar resumo da OP' });
  }
};

module.exports = {
  criarOp,
  adicionarEvento,
  finalizarMontagem,
  finalizarTeste,
  finalizarEmbalagemEstoque,
  resumoOp,
};
