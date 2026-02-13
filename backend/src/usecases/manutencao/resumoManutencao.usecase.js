const manutencaoRepo = require('../../repositories/manutencao.repository');
const { formatDateTimeBr } = require('../../utils/dateBr');

async function execute({ params }) {
  const { id } = params;

  if (!id) return { status: 400, body: { erro: 'id obrigatorio' } };

  const manutencao = await manutencaoRepo.findByIdResumo(String(id));
  if (!manutencao) return { status: 404, body: { erro: 'Manutencao nao encontrada' } };

  return {
    status: 200,
    body: {
      ok: true,
      manutencao: {
        id: manutencao.id,
        numeroOS: manutencao.numeroOS,
        empresa: manutencao.empresa,
        status: manutencao.status,
        serieProduto: manutencao.serieProduto,
        codProdutoOmie: manutencao.codProdutoOmie,
        clienteNome: manutencao.clienteNome,
        defeitoRelatado: manutencao.defeitoRelatado,
        diagnostico: manutencao.diagnostico,
        emGarantia: manutencao.emGarantia,
        aprovadoOrcamento: manutencao.aprovadoOrcamento,
        dataChegadaTransportadora: formatDateTimeBr(manutencao.dataChegadaTransportadora, { withDash: true }),
        dataEntrada: formatDateTimeBr(manutencao.dataEntrada, { withDash: true }),
        dataAprovacao: formatDateTimeBr(manutencao.dataAprovacao, { withDash: true }),
        dataFinalizacao: formatDateTimeBr(manutencao.dataFinalizacao, { withDash: true }),
        pesoKg: manutencao.pesoKg,
        volumeM3: manutencao.volumeM3,
        observacao: manutencao.observacao,
        eventos: (manutencao.eventos || []).map((e) => ({
          tipo: e.tipo,
          funcionarioId: e.funcionarioId,
          observacao: e.observacao || null,
          criadoEm: formatDateTimeBr(e.criadoEm, { withDash: true })
        })),
        pecasTrocadas: (manutencao.pecasTrocadas || []).map((p) => ({
          codigoPeca: p.codigoPeca,
          qrCode: p.qrCode || null,
          qrId: p.qrId || null,
          quantidade: p.quantidade,
          funcionarioId: p.funcionarioId,
          criadoEm: formatDateTimeBr(p.criadoEm, { withDash: true })
        }))
      }
    }
  };
}

module.exports = { execute };
