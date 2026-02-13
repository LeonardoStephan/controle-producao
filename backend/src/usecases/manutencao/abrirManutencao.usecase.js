const crypto = require('crypto');
const manutencaoRepo = require('../../repositories/manutencao.repository');
const manutencaoEventoRepo = require('../../repositories/manutencaoEvento.repository');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');
const { consultarOrdemServico } = require('../../integrations/omie/omie.facade');

async function execute(body) {
  try {
    const {
      numeroOS,
      empresa,
      funcionarioId,
      serieProduto,
      codProdutoOmie,
      clienteNome,
      defeitoRelatado,
      dataChegadaTransportadora,
      dataEntrada
    } = body;

    if (!empresa || !funcionarioId || !serieProduto) {
      return { status: 400, body: { erro: 'empresa, funcionarioId e serieProduto sao obrigatorios' } };
    }

    const serie = String(serieProduto).trim();
    const pf = await produtoFinalRepo.findBySerie(serie);
    const emp = String(empresa).trim();

    let osOmie = null;
    if (numeroOS) {
      osOmie = await consultarOrdemServico(numeroOS, emp);
    }

    const codProdutoResolvido = codProdutoOmie
      ? String(codProdutoOmie).trim()
      : (osOmie?.codProdutoOmie
          ? String(osOmie.codProdutoOmie).trim()
          : (pf?.codProdutoOmie ? String(pf.codProdutoOmie).trim() : null));

    const manutencao = await manutencaoRepo.create({
      id: crypto.randomUUID(),
      numeroOS: numeroOS ? String(numeroOS).trim() : null,
      empresa: emp,
      status: 'recebida',
      funcionarioAberturaId: String(funcionarioId).trim(),
      funcionarioAtualId: String(funcionarioId).trim(),
      serieProduto: serie,
      codProdutoOmie: codProdutoResolvido,
      clienteNome: clienteNome
        ? String(clienteNome).trim()
        : (osOmie?.clienteNome ? String(osOmie.clienteNome).trim() : null),
      defeitoRelatado: defeitoRelatado ? String(defeitoRelatado) : null,
      dataChegadaTransportadora: dataChegadaTransportadora ? new Date(dataChegadaTransportadora) : null,
      dataEntrada: dataEntrada ? new Date(dataEntrada) : new Date(),
      serieProdFinalId: pf?.id || null
    });

    await manutencaoEventoRepo.create({
      id: crypto.randomUUID(),
      manutencaoId: manutencao.id,
      tipo: 'abertura',
      funcionarioId: String(funcionarioId).trim(),
      observacao: 'Manutencao recebida e registrada no sistema'
    });

    return {
      status: 200,
      body: {
        ok: true,
        mensagem: 'Manutencao aberta com sucesso',
        origemOS: osOmie ? 'omie' : 'manual',
        manutencao: {
          id: manutencao.id,
          numeroOS: manutencao.numeroOS,
          empresa: manutencao.empresa,
          status: manutencao.status,
          serieProduto: manutencao.serieProduto,
          codProdutoOmie: manutencao.codProdutoOmie,
          clienteNome: manutencao.clienteNome,
          dataEntrada: manutencao.dataEntrada
        }
      }
    };
  } catch (err) {
    if (err?.code === 'P2002') {
      return { status: 400, body: { erro: 'numeroOS ja esta em uso' } };
    }
    console.error('Erro abrirManutencao:', err);
    return { status: 500, body: { erro: 'Erro interno ao abrir manutencao' } };
  }
}

module.exports = { execute };
