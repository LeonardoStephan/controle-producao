const manutencaoRepo = require('../../repositories/manutencao.repository');
const { formatDateTimeBr } = require('../../utils/dateBr');

async function execute({ params }) {
  const { serie } = params;
  if (!serie) return { status: 400, body: { erro: 'serie obrigatoria' } };

  const historico = await manutencaoRepo.findHistoricoBySerie(String(serie).trim());

  return {
    status: 200,
    body: {
      ok: true,
      serieProduto: String(serie).trim(),
      total: historico.length,
      manutencoes: historico.map((m) => ({
        id: m.id,
        numeroOS: m.numeroOS,
        status: m.status,
        emGarantia: m.emGarantia,
        aprovadoOrcamento: m.aprovadoOrcamento,
        dataEntrada: formatDateTimeBr(m.dataEntrada, { withDash: true }),
        dataFinalizacao: formatDateTimeBr(m.dataFinalizacao, { withDash: true }),
        pecasTrocadas: (m.pecasTrocadas || []).map((p) => ({
          codigoPeca: p.codigoPeca,
          qrId: p.qrId || null,
          quantidade: p.quantidade
        }))
      }))
    }
  };
}

module.exports = { execute };
