function getOmieCredenciais(empresa) {
  if (empresa === 'marchi') {
    return {
      appKey: process.env.OMIE_MARCHI_APP_KEY,
      appSecret: process.env.OMIE_MARCHI_APP_SECRET
    };
  }

  if (empresa === 'gs') {
    return {
      appKey: process.env.OMIE_GS_APP_KEY,
      appSecret: process.env.OMIE_GS_APP_SECRET
    };
  }

  throw new Error(`Empresa inválida para Omie: ${empresa}`);
}

module.exports = {
  getOmieCredenciais
};
