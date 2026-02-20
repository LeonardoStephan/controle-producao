function extrairCodigoDaPecaDoQr(qrCode) {
  if (!qrCode) return null;
  const parts = String(qrCode).split(';').map((p) => p.trim());
  const codigo = parts[1] ? String(parts[1]).trim() : null;
  return codigo || null;
}

function extrairQrId(qrCode) {
  if (!qrCode) return null;

  // Regra: qrId e o conteudo apos o ultimo ';' (ex.: "ID:1770380730668")
  const partes = String(qrCode).split(';');
  if (!partes.length) return null;

  const ultimoCampo = String(partes[partes.length - 1] || '').trim();
  return ultimoCampo || null;
}

module.exports = {
  extrairCodigoDaPecaDoQr,
  extrairQrId
};