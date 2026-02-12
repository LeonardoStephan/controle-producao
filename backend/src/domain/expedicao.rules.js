const produtoFinalRepo = require('../repositories/produtoFinal.repository');

/* =====================================================
   REGRA ROBUSTA:
   Produto "tem série" se existe ProdutoFinal no banco
   com esse codProdutoOmie E com serie preenchida.
===================================================== */
async function produtoPossuiSerieNoSistema(codProdutoOmie) {
  const existe = await produtoFinalRepo.findFirstByCodProdutoOmie(String(codProdutoOmie), { id: true });
  return !!existe;
}

module.exports = { produtoPossuiSerieNoSistema };
