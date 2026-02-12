const axios = require('axios');
const { getOmieCredenciais } = require('../../config/omie.config');

function normalizarErroOmie(err) {
  const data = err.response?.data;
  const fault = String(data?.faultstring || '').toLowerCase();
  const statusCode = data?.error?.status_code;

  return {
    raw: data || err.message,
    statusCode,
    fault,
    isNotFound:
      statusCode === 404 ||
      fault.includes('not found') ||
      fault.includes('não encontrado') ||
      fault.includes('nao encontrado') ||
      fault.includes('inexistente') ||
      fault.includes('não existe') ||
      fault.includes('nao existe')
  };
}

async function postOmie({ endpoint, call, param, empresa, timeout = 40000 }) {
  const { appKey, appSecret } = getOmieCredenciais(empresa);

  try {
    const resp = await axios.post(
      endpoint,
      {
        call,
        param,
        app_key: appKey,
        app_secret: appSecret
      },
      { timeout }
    );

    return { ok: true, data: resp.data };
  } catch (err) {
    const e = normalizarErroOmie(err);
    return { ok: false, error: e };
  }
}

module.exports = { postOmie };
