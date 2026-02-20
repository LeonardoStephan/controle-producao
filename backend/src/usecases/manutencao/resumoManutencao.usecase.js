const manutencaoRepo = require('../../repositories/manutencao.repository');
const { formatDateTimeBr } = require('../../utils/dateBr');
const { consultarOrdemServico } = require('../../integrations/omie/omie.facade');
const { carregarMapaNomePorCracha, nomePorCrachaOuOriginal } = require('../../utils/funcionarioNome');

async function execute({ params }) {
  const empresa = String(params?.empresa || '').trim();
  const numeroOS = String(params?.numeroOS || '').trim();

  if (!empresa || !numeroOS) {
    return { status: 400, body: { erro: 'empresa e numeroOS são obrigatórios' } };
  }

  const manutencaoRef = await manutencaoRepo.findByNumeroOS(numeroOS);
  if (!manutencaoRef || String(manutencaoRef.empresa || '').trim() !== empresa) {
    return { status: 404, body: { erro: 'manutenção não encontrada' } };
  }

  const manutencao = await manutencaoRepo.findByIdResumo(String(manutencaoRef.id));
  if (!manutencao) return { status: 404, body: { erro: 'manutenção não encontrada' } };

  let clienteNome = manutencao.clienteNome || null;
  let clienteEmail = null;
  const precisaConsultarOS = !clienteNome || !clienteEmail;
  if (precisaConsultarOS && manutencao.numeroOS && manutencao.empresa) {
    const osOmie = await consultarOrdemServico(manutencao.numeroOS, manutencao.empresa).catch(() => null);
    if (!clienteNome) {
      clienteNome = osOmie?.clienteNome ? String(osOmie.clienteNome).trim() : null;
    }
    clienteEmail = osOmie?.clienteEmail ? String(osOmie.clienteEmail).trim() : null;
  }

  const crachas = [
    ...(manutencao.eventos || []).map((e) => e.funcionarioId),
    ...(manutencao.pecasTrocadas || []).map((p) => p.funcionarioId)
  ];
  const mapaNomes = await carregarMapaNomePorCracha(crachas);

  return {
    status: 200,
    body: {
      ok: true,
      manutencao: {
        id: manutencao.id,
        numeroOS: manutencao.numeroOS,
        empresa: manutencao.empresa,
        status: manutencao.status,
        series: (manutencao.series || []).map((s) => ({
          id: s.id,
          serie: s.serie,
          codProdutoOmie: s.codProdutoOmie || null,
          serieProdFinalId: s.serieProdFinalId || null,
          criadoEm: formatDateTimeBr(s.criadoEm, { withDash: true })
        })),
        codProdutoOmie: manutencao.codProdutoOmie,
        clienteNome,
        clienteEmail,
        defeitoRelatado: manutencao.defeitoRelatado,
        diagnostico: manutencao.diagnostico,
        emGarantia: manutencao.emGarantia,
        aprovadoOrcamento: manutencao.aprovadoOrcamento,
        dataChegadaTransportadora: formatDateTimeBr(manutencao.dataChegadaTransportadora, { withDash: true }),
        dataEntrada: formatDateTimeBr(manutencao.dataEntrada, { withDash: true }),
        dataAprovacao: formatDateTimeBr(manutencao.dataAprovacao, { withDash: true }),
        dataFinalizacao: formatDateTimeBr(manutencao.dataFinalizacao, { withDash: true }),
        pesoKg: manutencao.pesoKg,
        altura: manutencao.altura,
        largura: manutencao.largura,
        comprimento: manutencao.comprimento,
        observacao: manutencao.observacao,
        eventos: (manutencao.eventos || []).map((e) => ({
          tipo: e.tipo,
          funcionarioNome: nomePorCrachaOuOriginal(e.funcionarioId, mapaNomes),
          setor: e.setor || null,
          observacao: e.observacao || null,
          criadoEm: formatDateTimeBr(e.criadoEm, { withDash: true })
        })),
        pecasTrocadas: (manutencao.pecasTrocadas || []).map((p) => ({
          codigoPeca: p.codigoPeca,
          codigoSubproduto: p.codigoSubproduto || null,
          descricaoSubproduto: p.descricaoSubproduto || null,
          qrCode: p.qrCode || null,
          qrId: p.qrId || null,
          quantidade: p.quantidade,
          funcionarioNome: nomePorCrachaOuOriginal(p.funcionarioId, mapaNomes),
          criadoEm: formatDateTimeBr(p.criadoEm, { withDash: true }),
          fimEm: formatDateTimeBr(p.fimEm, { withDash: true })
        }))
      }
    }
  };
}

module.exports = { execute };
