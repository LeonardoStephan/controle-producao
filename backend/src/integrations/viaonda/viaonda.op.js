const { getAppHash, post } = require('./viaonda.client');

/**
 * Retorna o array completo (comportamento atual)
 */
async function buscarOP(numeroOP, empresa) {
  const response = await post(
    'http://restrito.viaondarfid.com.br/api/produto_etiqueta.php',
    {
      appHash: getAppHash(empresa),
      numOrdemProducao: String(numeroOP)
    }
  );

  if (response.data.response_code !== '200' || !response.data.data?.length) {
    return null;
  }

  return response.data.data;
}

/**
 * ✅ Compatibilidade com iniciarOp.usecase:
 * retorna apenas o primeiro item (ou null), igual seu controller antigo fazia.
 */
async function buscarOpNaAPI(numeroOP, empresa) {
  const data = await buscarOP(numeroOP, empresa);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

module.exports = {
  buscarOP,
  buscarOpNaAPI
};
