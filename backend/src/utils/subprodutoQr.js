function extrairCodigoDoQr(qr) {
  if (!qr || typeof qr !== 'string') return null;
  const partes = qr.split(';').map(p => p.trim()).filter(Boolean);
  return partes[1] || null;
}

module.exports = { extrairCodigoDoQr };
