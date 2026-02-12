const crypto = require('crypto');
const fotoRepo = require('../../repositories/fotoExpedicao.repository');
const expedicaoSerieRepo = require('../../repositories/expedicaoSerie.repository');

async function execute({ params, body }) {
  try {
    const { id } = params; // expedicaoSerieId
    const { url } = body;

    if (!id) return { status: 400, body: { erro: 'expedicaoSerieId é obrigatório na rota' } };
    if (!url) return { status: 400, body: { erro: 'URL obrigatória' } };

    const serieVinculada = await expedicaoSerieRepo.findById(id);
    if (!serieVinculada) {
      return { status: 404, body: { erro: 'expedicaoSerieId não encontrado' } };
    }

    const foto = await fotoRepo.create({
      id: crypto.randomUUID(),
      expedicaoSerieId: String(id),
      url: String(url)
    });

    return { status: 200, body: { ok: true, foto } };
  } catch (err) {
    console.error('Erro uploadFotoSerie:', err);
    return { status: 500, body: { erro: 'Erro interno ao salvar foto' } };
  }
}

module.exports = { execute };
