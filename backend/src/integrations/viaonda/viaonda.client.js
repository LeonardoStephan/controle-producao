const axios = require('axios');

function getAppHash(empresa) {
  if (empresa === 'marchi') return 'marchi-01i5xgxk';
  if (empresa === 'gs') return 'gs-01i4odn5';
  throw new Error('Empresa inválida');
}

async function post(url, data, options = {}) {
  return axios.post(url, data, { timeout: 30000, ...options });
}

module.exports = { getAppHash, post };
