const { getAppHash, post } = require('./viaonda.client');
const { buscarOP } = require('./viaonda.op');

async function buscarEtiquetaProdutoFinal(numeroOP, empresa) {
  const response = await post(
    'http://restrito.viaondarfid.com.br/api/reimprimir_etiqueta.php',
    {
      appHash: getAppHash(empresa),
      numOrdemProducao: numeroOP
    }
  );

  if (response.data.response_code !== '200') return [];
  return response.data.data || [];
}

async function buscarEtiquetaSubproduto(numeroOP, serie, empresa) {
  const etiquetas = await buscarOP(numeroOP, empresa);
  if (!etiquetas) return false;
  return etiquetas.some(e => e.serie === serie);
}

async function viaOndaTemEtiqueta(codProdutoOmie, empresa) {
  try {
    const response = await post(
      'http://restrito.viaondarfid.com.br/api/reimprimir_etiqueta.php',
      {
        appHash: getAppHash(empresa),
        codProduto: codProdutoOmie
      }
    );

    if (response.data.response_code !== '200') return false;
    return Array.isArray(response.data.data) && response.data.data.length > 0;
  } catch (err) {
    console.error('ViaOnda erro ao verificar etiqueta:', err.message);
    return false;
  }
}

module.exports = {
  buscarEtiquetaProdutoFinal,
  buscarEtiquetaSubproduto,
  viaOndaTemEtiqueta
};
