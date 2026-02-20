const crypto = require('crypto');
const manutencaoRepo = require('../../repositories/manutencao.repository');
const manutencaoEventoRepo = require('../../repositories/manutencaoEvento.repository');
const manutencaoSerieRepo = require('../../repositories/manutencaoSerie.repository');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');
const { consultarOrdemServico } = require('../../integrations/omie/omie.facade');
const { getOmieCredenciais } = require('../../config/omie.config');
const { SETOR_FINANCEIRO, obterSetorPorFuncionarioAsync } = require('../../domain/setorManutencao');

async function execute(body) {
  try {
    const {
      numeroOS,
      empresa,
      funcionarioId,
      serieProduto,
      clienteNome,
      clienteEmail,
      defeitoRelatado,
      dataChegadaTransportadora,
      dataEntrada
    } = body;

    if (!empresa || !funcionarioId || !numeroOS) {
      return { status: 400, body: { erro: 'empresa, funcionarioId e numeroOS são obrigatórios' } };
    }

    const setorFuncionario = await obterSetorPorFuncionarioAsync(funcionarioId);
    if (!setorFuncionario) {
      return {
        status: 403,
        body: { erro: "Funcionário sem setor configurado. Cadastre o crachá em /admin/funcionarios." }
      };
    }
    if (setorFuncionario !== SETOR_FINANCEIRO) {
      return { status: 403, body: { erro: "Abertura de manutenção permitida apenas para o setor 'financeiro'" } };
    }

    console.info('[manutencao.abrir] solicitacao', {
      numeroOS: String(numeroOS).trim(),
      empresa: String(empresa).trim(),
      funcionarioId: String(funcionarioId).trim(),
      setor: setorFuncionario
    });

    const emp = String(empresa).trim();
    const serie = serieProduto ? String(serieProduto).trim() : '';
    const pf = serie ? await produtoFinalRepo.findBySerie(serie) : null;

    let credenciaisOmie = null;
    try {
      credenciaisOmie = getOmieCredenciais(emp);
    } catch (_e) {
      return { status: 400, body: { erro: `Empresa inválida para Omie: ${emp}` } };
    }

    if (!credenciaisOmie?.appKey || !credenciaisOmie?.appSecret) {
      return { status: 400, body: { erro: `Credenciais Omie ausentes para empresa: ${emp}` } };
    }

    if (serie) {
      const manutencaoAtiva = await manutencaoRepo.findAtivaBySerie(serie);
      if (manutencaoAtiva) {
        return {
          status: 400,
          body: {
            erro: 'Já existe manutenção ativa para esta série',
            manutencaoAtiva: {
              id: manutencaoAtiva.id,
              numeroOS: manutencaoAtiva.numeroOS,
              status: manutencaoAtiva.status,
              serie
            }
          }
        };
      }
    }

    const osOmie = await consultarOrdemServico(numeroOS, emp);
    if (!osOmie) {
      return {
        status: 400,
        body: { erro: 'OS não encontrada no OMIE', numeroOS: String(numeroOS).trim() }
      };
    }

    const manutencaoJaExistenteOS = await manutencaoRepo.findByNumeroOS(numeroOS);
    if (manutencaoJaExistenteOS) {
      return {
        status: 400,
        body: {
          erro: `OS ${String(numeroOS).trim()} já está em uso`,
          manutencaoExistente: {
            id: manutencaoJaExistenteOS.id,
            numeroOS: manutencaoJaExistenteOS.numeroOS,
            status: manutencaoJaExistenteOS.status
          }
        }
      };
    }

    const manutencao = await manutencaoRepo.create({
      id: crypto.randomUUID(),
      numeroOS: String(numeroOS).trim(),
      empresa: emp,
      status: 'recebida',
      funcionarioAberturaId: String(funcionarioId).trim(),
      funcionarioAtualId: String(funcionarioId).trim(),
      codProdutoOmie: null,
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
      setor: setorFuncionario,
      observacao: 'Manutenção recebida e registrada no sistema'
    });

    if (serie) {
      await manutencaoSerieRepo.create({
        id: crypto.randomUUID(),
        manutencaoId: manutencao.id,
        serie,
        codProdutoOmie: pf?.codProdutoOmie || null,
        serieProdFinalId: pf?.id || null
      });
    }

    console.info('[manutencao.abrir] criado', {
      manutencaoId: manutencao.id,
      numeroOS: manutencao.numeroOS,
      status: manutencao.status,
      funcionarioId: String(funcionarioId).trim(),
      setor: setorFuncionario
    });

    return {
      status: 200,
      body: {
        ok: true,
        mensagem: 'Manutenção aberta com sucesso',
        manutencao: {
          id: manutencao.id,
          numeroOS: manutencao.numeroOS,
          status: manutencao.status,
          series: serie ? [serie] : [],
          clienteNome: manutencao.clienteNome,
          clienteEmail: clienteEmail
            ? String(clienteEmail).trim()
            : (osOmie?.clienteEmail ? String(osOmie.clienteEmail).trim() : null),
          dataEntrada: manutencao.dataEntrada
        }
      }
    };
  } catch (err) {
    if (err?.code === 'P2002') {
      const numero = String(body?.numeroOS || '').trim();
      const existente = numero ? await manutencaoRepo.findByNumeroOS(numero) : null;
      return {
        status: 400,
        body: {
          erro: numero ? `OS ${numero} já está em uso` : 'numeroOS já está em uso',
          manutencaoExistente: existente
            ? { id: existente.id, numeroOS: existente.numeroOS, status: existente.status }
            : null
        }
      };
    }

    console.error('Erro abrirManutencao:', err);
    return { status: 500, body: { erro: 'Erro interno ao abrir manutenção' } };
  }
}

module.exports = { execute };



