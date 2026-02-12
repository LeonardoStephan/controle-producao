const crypto = require('crypto');

const expedicaoRepo = require('../../../repositories/expedicao.repository');
const fotoGeralRepo = require('../../../repositories/fotoExpedicaoGeral.repository');

async function execute(body) {
  try {
    const { expedicaoId, url, descricao } = body;

    if (!expedicaoId || !url) {
      return { status: 400, body: { erro: 'expedicaoId e url são obrigatórios' } };
    }

    const exp = await expedicaoRepo.findByIdSelect(expedicaoId, { id: true });
    if (!exp) {
      return { status: 404, body: { erro: 'Expedição não encontrada' } };
    }

    const foto = await fotoGeralRepo.create({
      id: crypto.randomUUID(),
      expedicaoId: String(expedicaoId),
      url: String(url),
      descricao: descricao || null
    });

    return { status: 200, body: { ok: true, foto } };
  } catch (err) {
    console.error('Erro uploadFotoGeral:', err);
    return { status: 500, body: { erro: 'Erro interno ao salvar foto geral' } };
  }
}

module.exports = { execute };
