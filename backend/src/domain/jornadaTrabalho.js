const { getBrParts, brLocalToUtcDate, addOneDayYmd, compareYmd } = require('../utils/timeZoneBr');

const JANELAS_JORNADA = [
  { inicio: { h: 7, m: 0 }, fim: { h: 12, m: 0 } },
  { inicio: { h: 13, m: 0 }, fim: { h: 17, m: 0 } }
];

function isDentroJornada(date = new Date()) {
  const d = getBrParts(date);
  if (!d) return false;

  const minutoDia = d.hour * 60 + d.minute;

  for (const j of JANELAS_JORNADA) {
    const iniMin = j.inicio.h * 60 + j.inicio.m;
    const fimMin = j.fim.h * 60 + j.fim.m;
    if (minutoDia >= iniMin && minutoDia < fimMin) return true;
  }

  return false;
}

function calcularMsDentroJornada(inicio, fim) {
  const ini = new Date(inicio);
  const end = new Date(fim);
  if (Number.isNaN(ini.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end <= ini) return 0;

  let total = 0;
  let dia = getBrParts(ini);
  const ultimoDia = getBrParts(end);
  if (!dia || !ultimoDia) return 0;

  while (compareYmd(dia, ultimoDia) <= 0) {
    for (const j of JANELAS_JORNADA) {
      const janelaIni = brLocalToUtcDate(dia.year, dia.month, dia.day, j.inicio.h, j.inicio.m, 0);
      const janelaFim = brLocalToUtcDate(dia.year, dia.month, dia.day, j.fim.h, j.fim.m, 0);

      const sobreIni = ini > janelaIni ? ini : janelaIni;
      const sobreFim = end < janelaFim ? end : janelaFim;
      if (sobreFim > sobreIni) total += sobreFim - sobreIni;
    }

    dia = { ...addOneDayYmd(dia.year, dia.month, dia.day), hour: 0, minute: 0, second: 0 };
  }

  return total;
}

module.exports = {
  JANELAS_JORNADA,
  isDentroJornada,
  calcularMsDentroJornada
};
