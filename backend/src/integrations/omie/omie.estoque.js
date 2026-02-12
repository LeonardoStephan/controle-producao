const axios = require('axios');
const { getOmieCredenciais } = require('../../config/omie.config');

function formatarDataOmie(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function consultarEstoquePadrao(codProdutoOmie, empresa) {
  const { appKey, appSecret } = getOmieCredenciais(empresa);

  try {
    const response = await axios.post(
      'https://app.omie.com.br/api/v1/estoque/resumo/',
      {
        call: 'ObterEstoqueProduto',
        param: [
          {
            cEAN: '',
            nIdProduto: 0,
            cCodigo: String(codProdutoOmie),
            xCodigo: '',
            dDia: formatarDataOmie(new Date())
          }
        ],
        app_key: appKey,
        app_secret: appSecret
      },
      { timeout: 20000 }
    );

    const lista = response.data?.listaEstoque || [];

    return (
      lista.find((e) => e.cDescricaoLocal === 'Local de Estoque Padrão') || null
    );
  } catch (err) {
    console.error('❌ Omie ObterEstoqueProduto:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { consultarEstoquePadrao };
