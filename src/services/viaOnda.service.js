const axios = require('axios');

function getAppHash(empresa) {
  if (empresa === 'marchi') return 'marchi-01i5xgxk';
  if (empresa === 'gs') return 'gs-01i4odn5';
  throw new Error('Empresa inválida');
}

/* =========================
   OP FINAL
========================= */
async function buscarOPFinal(numeroOP, empresa) {
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

  return response.data.data[0];
}

/* =========================
   ETIQUETAS PRODUTO FINAL
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
   ETIQUETAS SUBPRODUTO
========================= */
async function buscarEtiquetaSubproduto(numeroOP, serie, empresa) {
  const etiquetas = await buscarEtiquetaProdutoFinal(numeroOP, empresa);
  return etiquetas.some(e => e.serie === serie);
}

module.exports = {
  buscarOPFinal,
  buscarEtiquetaProdutoFinal,
  buscarEtiquetaSubproduto
};
