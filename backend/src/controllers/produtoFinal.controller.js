const crypto = require('crypto');
const { prisma } = require('../database/prisma');
const { buscarEtiquetaProdutoFinal } = require('../services/viaOnda.service');
const axios = require('axios');

/* =========================
   FUNÇÃO AUXILIAR: Validar codProduto Omie
========================= */
async function validarCodProdutoOmie(codProduto, empresa) {
  try {
    const response = await axios.post('https://app.omie.com.br/api/v1/geral/malha/', {
      call: "ConsultarEstrutura",
      param: [{ codProduto }],
      app_key: process.env.OMIE_APP_KEY,
      app_secret: process.env.OMIE_APP_SECRET
    });

    const ident = response.data.ident;
    if (!ident || !ident.codProduto) {
      throw new Error('Produto Omie não encontrado');
    }

    return ident.codProduto;
  } catch (err) {
    console.error('Erro ao validar codProduto Omie:', err.message);
    throw new Error('Falha ao consultar Omie');
  }
}

/* =========================
   CRIAR PRODUTO FINAL
========================= */
const criarProdutoFinal = async (req, res) => {
  try {
    const { opId, serieProdutoFinal, empresa, codProdutoOmie } = req.body;

    if (!opId || !serieProdutoFinal || !empresa || !codProdutoOmie) {
      return res.status(400).json({ erro: 'Dados obrigatórios ausentes' });
    }

    // 1️⃣ Verifica se a OP existe
    const op = await prisma.ordemProducao.findUnique({ where: { id: opId } });
    if (!op) return res.status(404).json({ erro: 'OP não encontrada' });

    // 2️⃣ Valida série via API ViaOnda
    const etiquetas = await buscarEtiquetaProdutoFinal(op.numeroOP, empresa);
    if (!etiquetas.some(e => e.serie === serieProdutoFinal)) {
      return res.status(400).json({ erro: 'Série não pertence à OP final ou não foi impressa' });
    }

    // 3️⃣ Impede duplicação
    const jaExiste = await prisma.produtoFinal.findUnique({ where: { serie: serieProdutoFinal } });
    if (jaExiste) return res.status(400).json({ erro: 'Produto final já registrado com esta série' });

    // 4️⃣ Valida codProdutoOmie via Omie
    const codProdutoValidado = await validarCodProdutoOmie(codProdutoOmie, empresa);

    // 5️⃣ Cria produto final
    const produtoFinal = await prisma.produtoFinal.create({
      data: {
        id: crypto.randomUUID(),
        opId,
        serie: serieProdutoFinal,
        codProdutoOmie: codProdutoValidado,
        empresa // armazenando empresa para referência futura
      }
    });

    return res.json({ ok: true, produtoFinal });

  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno', detalhes: err.message });
  }
};

module.exports = { criarProdutoFinal };
