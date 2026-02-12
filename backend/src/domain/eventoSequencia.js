function validarSequenciaEvento({ ultimoTipo, novoTipo, permitirFimSemPausa = true }) {
  const u = ultimoTipo || null;
  const n = novoTipo;

  const validos = new Set(['inicio', 'pausa', 'retorno', 'fim']);
  if (!validos.has(n)) {
    return { ok: false, erro: 'Tipo de evento inválido' };
  }

  // 1) Primeiro evento permitido: inicio
  if (!u) {
    if (n === 'inicio') return { ok: true };
    return { ok: false, erro: 'Primeiro evento deve ser "inicio"' };
  }

  // 2) Regras gerais
  if (n === 'inicio') {
    // "inicio" só faz sentido se último foi "fim" (reiniciar fluxo)
    if (u === 'fim') return { ok: true };
    return { ok: false, erro: 'Só é possível iniciar após "fim"' };
  }

  if (n === 'pausa') {
    if (u === 'inicio' || u === 'retorno') return { ok: true };
    return { ok: false, erro: 'Só é possível pausar após "inicio" ou "retorno"' };
  }

  if (n === 'retorno') {
    if (u === 'pausa') return { ok: true };
    return { ok: false, erro: 'Só é possível retornar após "pausa"' };
  }

  if (n === 'fim') {
    if (u === 'inicio' || u === 'retorno') return { ok: true };
    if (permitirFimSemPausa && u === 'pausa') return { ok: true }; // opcional
    return { ok: false, erro: 'Só é possível finalizar após "inicio" ou "retorno"' };
  }

  return { ok: false, erro: 'Sequência inválida' };
}

module.exports = { validarSequenciaEvento };
