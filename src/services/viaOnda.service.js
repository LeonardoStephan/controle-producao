const axios = require('axios');

function getAppHash(empresa) {
  if (empresa === 'marchi') return 'marchi-01i5xgxk';
  if (empresa === 'gs') return 'gs-01i4odn5';
  throw new Error('Empresa inválida');
}

/* =========================
   BUSCAS PARA: OP FINAL OU SUBPRODUTO
========================= */
async function buscarOP(numeroOP, empresa) {
  const response = await axios.post(
    'http://restrito.viaondarfid.com.br/api/produto_etiqueta.php',
    {
      appHash: getAppHash(empresa),
      numOrdemProducao: numeroOP
    }
  );

  if (response.data.response_code !== '200' || !response.data.data?.length) {
    return null;
  }

  return response.data.data;
}

/* =========================
   BUSCAS PARA: ETIQUETAS PRODUTO FINAL
========================= */
async function buscarEtiquetaProdutoFinal(numeroOP, empresa) {
  const response = await axios.post(
    'http://restrito.viaondarfid.com.br/api/reimprimir_etiqueta.php',
    {
      appHash: getAppHash(empresa),
      numOrdemProducao: numeroOP
    }
  );

  if (response.data.response_code !== '200') {
    return [];
  }

  return response.data.data || [];
}

/* =========================
   BUSCAS PARA: ETIQUETA SUBPRODUTO
========================= */
async function buscarEtiquetaSubproduto(numeroOP, serie, empresa) {
  const etiquetas = await buscarOP(numeroOP, empresa);
  if (!etiquetas) return false;

  return etiquetas.some(e => e.serie === serie);
}

/* =========================
   PRODUTO POSSUI SÉRIE?
========================= */
async function viaOndaTemEtiqueta(codProdutoOmie, empresa) {
  try {
    const response = await axios.post(
      'http://restrito.viaondarfid.com.br/api/reimprimir_etiqueta.php',
      {
        appHash: getAppHash(empresa),
        codProduto: codProdutoOmie
      }
    );

    if (response.data.response_code !== '200') {
      return false;
    }

    // Se retornar dados, é porque há etiquetas (logo, possui série)
    return Array.isArray(response.data.data) && response.data.data.length > 0;

  } catch (err) {
    console.error('ViaOnda erro ao verificar etiqueta:', err.message);
    return false;
  }
}

module.exports = {
  buscarOP,
  buscarEtiquetaProdutoFinal,
  buscarEtiquetaSubproduto,
  viaOndaTemEtiqueta
};
