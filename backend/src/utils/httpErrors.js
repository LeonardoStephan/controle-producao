function conflictResponse(erro, detalhe = null) {
  return {
    status: 409,
    body: {
      erro,
      code: 'CONCURRENCY_CONFLICT',
      detalhe
    }
  };
}

function throwBusiness(status, erro, extra = {}) {
  const err = new Error(erro);
  err.isBusiness = true;
  err.status = status;
  err.body = { erro, ...extra };
  throw err;
}

module.exports = {
  conflictResponse,
  throwBusiness
};
