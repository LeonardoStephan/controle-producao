const axios = require('axios');
const { getOmieCredenciais } = require('../../config/omie.config');
const { getBrParts } = require('../../utils/timeZoneBr');

function formatarDataOmie(date = new Date()) {
  const dt = getBrParts(date) || {
    day: date.getDate(),
    month: date.getMonth() + 1,
    year: date.getFullYear()
  };

  const dd = String(dt.day).padStart(2, '0');
  const mm = String(dt.month).padStart(2, '0');
  const yyyy = dt.year;
  return `${dd}/${mm}/${yyyy}`;
}

function normalizarTexto(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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
    const alvo = normalizarTexto('Local de Estoque Padrao');

    return lista.find((e) => normalizarTexto(e.cDescricaoLocal) === alvo) || null;
  } catch (err) {
    console.error('Omie ObterEstoqueProduto:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { consultarEstoquePadrao };
