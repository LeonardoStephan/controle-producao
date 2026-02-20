const axios = require('axios');
const { getOmieCredenciais } = require('../../config/omie.config');

function normalizarErroOmieData(data) {
  const fault = String(data?.faultstring || '').toLowerCase();
  const statusCode = data?.error?.status_code;

  return {
    raw: data,
    statusCode,
    fault,
    isNotFound:
      statusCode === 404 ||
      fault.includes('not found') ||
      fault.includes('não encontrado') ||
      fault.includes('Não encontrado') ||
      fault.includes('inexistente') ||
      fault.includes('não existe') ||
      fault.includes('Não existe')
  };
}

function normalizarErroOmie(err) {
  const data = err.response?.data;
  if (data) return normalizarErroOmieData(data);
  return { raw: err.message, statusCode: null, fault: '', isNotFound: false };
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

    const data = resp.data;

    // Omie pode retornar erro de negócio com HTTP 200 (faultcode/faultstring no body).
    if (data && (data.faultcode || data.faultstring)) {
      return { ok: false, error: normalizarErroOmieData(data) };
    }

    return { ok: true, data };
  } catch (err) {
    const e = normalizarErroOmie(err);
    return { ok: false, error: e };
  }
}

module.exports = { postOmie };
