const crypto = require('crypto');
const manutencaoRepo = require('../../repositories/manutencao.repository');
const manutencaoPecaRepo = require('../../repositories/manutencaoPecaTrocada.repository');
const { estruturaTemItem } = require('../../integrations/omie/omie.estrutura');
const { baixarPecaEstoqueOmie } = require('../../integrations/omie/omie.facade');
const { consultarProdutoNoOmie } = require('../../integrations/omie/omie.produto');
const { extrairQrId } = require('../../utils/pecaQr');
const { etapasAteReparo, STATUS_TERMINAIS_MANUTENCAO } = require('../../domain/fluxoManutencao');

async function execute({ params, body }) {
  let manutencao = null;
  try {
    const { id } = params;
    const { codigoPeca, funcionarioId, qrCode, quantidade = 1, sincronizarOmie = false } = body;

    if (!id || !codigoPeca || !funcionarioId) {
      return { status: 400, body: { erro: 'id, codigoPeca e funcionarioId sao obrigatorios' } };
    }

    manutencao = await manutencaoRepo.findById(String(id));
    if (!manutencao) return { status: 404, body: { erro: 'Manutencao nao encontrada' } };

    if (STATUS_TERMINAIS_MANUTENCAO.includes(manutencao.status)) {
      return {
        status: 400,
        body: {
          erro: `Manutencao esta encerrada em '${manutencao.status}'. Nao e possivel registrar pecas.`,
          statusAtual: manutencao.status
        }
      };
    }

    if (manutencao.status !== 'reparo') {
      return {
        status: 400,
        body: {
          erro: 'Pecas trocadas so podem ser registradas na etapa de reparo',
          statusAtual: manutencao.status,
          statusNecessario: 'reparo',
          etapasRestantesAteReparo: etapasAteReparo(manutencao.status),
          dica: "Avance a manutencao com POST /manutencao/:id/avancar ate status='reparo'"
        }
      };
    }

    const codigo = String(codigoPeca).trim();
    const emp = String(manutencao.empresa || '').trim();
    const codProduto = String(manutencao.codProdutoOmie || '').trim();
    let validacaoBom = 'nao_aplicada';

    if (emp && codProduto) {
      const produtoInfo = await consultarProdutoNoOmie(codProduto, emp).catch(() => null);
      const pertence = await estruturaTemItem(codProduto, emp, codigo);
      validacaoBom = pertence ? 'ok' : 'reprovada';
      if (!pertence) {
        return {
          status: 400,
          body: {
            erro: 'Peca nao pertence ao BOM do produto desta manutencao',
            codigoPeca: codigo,
            codProdutoOmie: codProduto,
            descricaoProduto: produtoInfo?.descricao || null
          }
        };
      }
    } else {
      validacaoBom = 'ignorada_sem_cod_produto';
    }

    const peca = await manutencaoPecaRepo.create({
      id: crypto.randomUUID(),
      manutencaoId: String(id),
      codigoPeca: codigo,
      qrCode: qrCode ? String(qrCode) : null,
      qrId: qrCode ? extrairQrId(qrCode) : null,
      quantidade: Number(quantidade) || 1,
      funcionarioId: String(funcionarioId).trim()
    });

    let baixaOmie = null;
    if (Boolean(sincronizarOmie)) {
      baixaOmie = await baixarPecaEstoqueOmie({
        empresa: manutencao.empresa,
        codigoPeca: codigo,
        quantidade: Number(quantidade) || 1,
        manutencaoId: manutencao.id,
        numeroOS: manutencao.numeroOS,
        observacao: `Baixa de manutencao ${manutencao.id}`
      });
    }

    return {
      status: 200,
      body: {
        ok: true,
        mensagem: 'Peca trocada registrada',
        peca: {
          id: peca.id,
          codigoPeca: peca.codigoPeca,
          qrCode: peca.qrCode || null,
          qrId: peca.qrId || null,
          quantidade: peca.quantidade,
          criadoEm: peca.criadoEm
        },
        validacaoBom,
        baixaOmie
      }
    };
  } catch (err) {
    console.error('Erro registrarPecaTrocadaManutencao:', err);
    let codProdutoOmie = null;
    let descricaoProduto = null;
    if (manutencao) {
      codProdutoOmie = manutencao.codProdutoOmie || null;
      if (codProdutoOmie && manutencao.empresa) {
        const produtoInfo = await consultarProdutoNoOmie(codProdutoOmie, manutencao.empresa).catch(() => null);
        descricaoProduto = produtoInfo?.descricao || null;
      }
    }
    return {
      status: 500,
      body: {
        erro: 'Erro interno ao registrar peca trocada na manutencao',
        codProdutoOmie,
        descricaoProduto
      }
    };
  }
}

module.exports = { execute };
