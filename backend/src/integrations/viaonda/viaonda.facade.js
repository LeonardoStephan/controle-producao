const { buscarOP } = require('./viaonda.op');
const {
  buscarEtiquetaProdutoFinal,
  buscarEtiquetaSubproduto,
  viaOndaTemEtiqueta,
  viaOndaTemSerie,
  consultarEtiquetaNfePorSerie,
  normalizeSerialInput
} = require('./viaonda.etiquetas');

module.exports = {
  buscarOP,
  buscarEtiquetaProdutoFinal,
  buscarEtiquetaSubproduto,
  viaOndaTemEtiqueta,
  viaOndaTemSerie,
  consultarEtiquetaNfePorSerie,
  normalizeSerialInput
};
