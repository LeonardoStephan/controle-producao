const crypto = require('crypto');
const manutencaoRepo = require('../../repositories/manutencao.repository');
const manutencaoPecaRepo = require('../../repositories/manutencaoPecaTrocada.repository');
const manutencaoSerieRepo = require('../../repositories/manutencaoSerie.repository');
const manutencaoEventoRepo = require('../../repositories/manutencaoEvento.repository');
const consumoPecaRepo = require('../../repositories/consumoPeca.repository');
const subprodutoRepo = require('../../repositories/subproduto.repository');
const produtoFinalRepo = require('../../repositories/produtoFinal.repository');
const {
  estruturaTemItem,
  consultarEstruturaProduto,
  extrairSubprodutosDoBOM
} = require('../../integrations/omie/omie.estrutura');
const { baixarPecaEstoqueOmie } = require('../../integrations/omie/omie.facade');
const { consultarProdutoNoOmie } = require('../../integrations/omie/omie.produto');
const { extrairCodigoDaPecaDoQr, extrairQrId } = require('../../utils/pecaQr');
const { etapasAteReparo, STATUS_TERMINAIS_MANUTENCAO } = require('../../domain/fluxoManutencao');
const { SETOR_MANUTENCAO, obterSetorPorFuncionarioAsync } = require('../../domain/setorManutencao');

async function execute({ params, body }) {
  let manutencao = null;
  try {
    const { id } = params;
    const {
      codigoPeca,
      funcionarioId,
      qrCode,
      quantidade = 1,
      sincronizarOmie = false,
      manutencaoSerieId
    } = body;

    if (!id || !codigoPeca || !funcionarioId) {
      return { status: 400, body: { erro: 'id, codigoPeca e funcionarioId são obrigatórios' } };
    }

    const setorFuncionario = await obterSetorPorFuncionarioAsync(funcionarioId);
    if (!setorFuncionario) {
      return {
        status: 403,
        body: { erro: "Funcionário sem setor configurado. Cadastre o crachá em /admin/funcionarios." }
      };
    }
    if (setorFuncionario !== SETOR_MANUTENCAO) {
      console.info('[manutencao.pecas] bloqueado_setor', {
        manutencaoId: String(id),
        funcionarioId: String(funcionarioId).trim(),
        setorRecebido: setorFuncionario
      });
      return {
        status: 403,
        body: { erro: "Registro de peças permitido apenas para o setor 'manutenção'" }
      };
    }

    manutencao = await manutencaoRepo.findById(String(id));
    if (manutencaoSerieId) {
      const seriesDaManutencao = await manutencaoSerieRepo.findByManutencaoId(String(id));
      const existeSerieRef = seriesDaManutencao.some((s) => s.id === String(manutencaoSerieId));
      if (!existeSerieRef) {
        return { status: 400, body: { erro: 'manutencaoSerieId inválido para esta manutenção' } };
      }
    }
    if (!manutencao) return { status: 404, body: { erro: 'Manutenção não encontrada' } };

    if (STATUS_TERMINAIS_MANUTENCAO.includes(manutencao.status)) {
      return {
        status: 400,
        body: {
          erro: `Manutenção está encerrada em '${manutencao.status}'. Não é possível registrar peças.`,
          statusAtual: manutencao.status
        }
      };
    }

    if (manutencao.status !== 'reparo') {
      return {
        status: 400,
        body: {
          erro: 'Peças trocadas só podem ser registradas na etapa de reparo',
          statusAtual: manutencao.status,
          statusNecessario: 'reparo',
          etapasRestantesAteReparo: etapasAteReparo(manutencao.status),
          dica: "Avance a manutenção com POST /manutencao/:id/avancar até status='reparo'"
        }
      };
    }

    const codigo = String(codigoPeca).trim();
    const emp = String(manutencao.empresa || '').trim();
    const seriesDaManutencao = await manutencaoSerieRepo.findByManutencaoId(String(id));
    const codigosDaManutencao = Array.from(
      new Set(
        (seriesDaManutencao || [])
          .map((s) => String(s.codProdutoOmie || '').trim())
          .filter(Boolean)
      )
    );

    let codProduto = String(manutencao.codProdutoOmie || '').trim();
    if (manutencaoSerieId) {
      const serieSelecionada = (seriesDaManutencao || []).find((s) => s.id === String(manutencaoSerieId));
      codProduto = String(serieSelecionada?.codProdutoOmie || codProduto || '').trim();
    } else if (!codProduto && codigosDaManutencao.length === 1) {
      codProduto = codigosDaManutencao[0];
    } else if (codigosDaManutencao.length > 1) {
      return {
        status: 400,
        body: {
          erro: 'Esta manutenção possui séries de mais de um produto. Informe manutencaoSerieId ao registrar a peça.'
        }
      };
    }

    let validacaoBom = 'nao_aplicada';
    let subprodutoContexto = null;

    if (emp && codProduto) {
      const produtoInfo = await consultarProdutoNoOmie(codProduto, emp).catch(() => null);
      let pertence = await estruturaTemItem(codProduto, emp, codigo);
      validacaoBom = pertence ? 'produto_principal' : 'reprovada';

      if (!pertence) {
        const serieProdFinalIds = new Set();

        if (manutencao.serieProdFinalId) {
          serieProdFinalIds.add(String(manutencao.serieProdFinalId));
        }

        for (const s of seriesDaManutencao) {
          if (s.serieProdFinalId) {
            serieProdFinalIds.add(String(s.serieProdFinalId));
            continue;
          }

          const serieTxt = String(s.serie || '').trim();
          if (!serieTxt) continue;
          const pf = await produtoFinalRepo.findBySerie(serieTxt);
          if (pf?.id) serieProdFinalIds.add(String(pf.id));
        }

        if (serieProdFinalIds.size > 0) {
          const matches = [];
          for (const seriePfId of serieProdFinalIds) {
            const placas = await subprodutoRepo.findManyBySerieProdFinalId(seriePfId);

            for (const p of placas) {
              const codPlaca = String(p.codigoSubproduto || '').trim();
              if (!codPlaca) continue;
              const okNaPlaca = await estruturaTemItem(codPlaca, emp, codigo);
              if (okNaPlaca) {
                matches.push({
                  subprodutoId: p.id,
                  etiquetaId: p.etiquetaId,
                  codigoSubproduto: codPlaca,
                  serieProdFinalId: seriePfId
                });
              }
            }
          }

          if (matches.length === 1) {
            pertence = true;
            validacaoBom = 'subproduto';
            const unico = matches[0];
            const subprodutoInfo = await consultarProdutoNoOmie(unico.codigoSubproduto, emp).catch(() => null);
            subprodutoContexto = {
              codigoSubproduto: unico.codigoSubproduto,
              descricaoSubproduto: subprodutoInfo?.descricao || null
            };
          } else if (matches.length > 1) {
            return {
              status: 400,
              body: {
                erro: 'Peça encontrada no BOM de mais de um subproduto vinculado. Informe a placa correta.',
                candidatos: matches
              }
            };
          }
        }

        // Fallback sem série vinculada: usa subprodutos previstos no BOM do produto principal.
        if (!pertence) {
          const estruturaPrincipal = await consultarEstruturaProduto(codProduto, emp).catch(() => null);
          const subprodutosBom = extrairSubprodutosDoBOM(estruturaPrincipal || {});
          const matchesBom = [];

          for (const sp of subprodutosBom) {
            const codSub = String(sp.codigo || '').trim();
            if (!codSub) continue;
            const okNaPlaca = await estruturaTemItem(codSub, emp, codigo);
            if (okNaPlaca) {
              matchesBom.push({ codigoSubproduto: codSub });
            }
          }

          if (matchesBom.length === 1) {
            pertence = true;
            validacaoBom = 'subproduto_bom';
            const unico = matchesBom[0];
            const subprodutoInfo = await consultarProdutoNoOmie(unico.codigoSubproduto, emp).catch(() => null);
            subprodutoContexto = {
              codigoSubproduto: unico.codigoSubproduto,
              descricaoSubproduto: subprodutoInfo?.descricao || null
            };
          } else if (matchesBom.length > 1) {
            return {
              status: 400,
              body: {
                erro: 'Peça encontrada no BOM de mais de um subproduto previsto no produto principal.',
                candidatos: matchesBom
              }
            };
          }
        }
      }

      if (!pertence) {
        return {
          status: 400,
          body: {
            erro: 'Peça não pertence ao BOM do produto desta manutenção nem ao BOM de subproduto vinculado',
            codigoPeca: codigo,
            codProdutoOmie: codProduto,
            descricaoProduto: produtoInfo?.descricao || null
          }
        };
      }
    } else {
      validacaoBom = 'ignorada_sem_cod_produto';
    }

    const pecaAtivaAnterior = await manutencaoPecaRepo.findAtivaPorCodigo({
      manutencaoId: String(id),
      codigoPeca: codigo
    });

    const qrInformado = String(qrCode || '').trim();
    if (qrInformado) {
      const codigoExtraidoQr = extrairCodigoDaPecaDoQr(qrInformado);
      if (!codigoExtraidoQr) {
        return { status: 400, body: { erro: 'QR inválido' } };
      }
      if (String(codigoExtraidoQr).trim() !== codigo) {
        return { status: 400, body: { erro: 'QR não corresponde ao código da peça' } };
      }
    }

    const qrIdInformado = qrInformado ? extrairQrId(qrInformado) : null;
    const possuiQrAnteriorNoContexto = Boolean(pecaAtivaAnterior?.qrCode || pecaAtivaAnterior?.qrId);
    const [historicoProdComQr, historicoManutComQr] = await Promise.all([
      consumoPecaRepo.existeHistoricoComQr(codigo),
      manutencaoPecaRepo.existeHistoricoComQr(codigo)
    ]);
    const qrObrigatorio = possuiQrAnteriorNoContexto || historicoProdComQr || historicoManutComQr;

    if (qrObrigatorio && !qrInformado) {
      return {
        status: 400,
        body: {
          erro: 'Esta peça exige leitura de QR Code para manter a rastreabilidade. Informe qrCode.',
          codigoPeca: codigo,
          qrObrigatorio: true
        }
      };
    }

    if (qrInformado) {
      const qrAtivo = await manutencaoPecaRepo.findQrAtivo(qrInformado);
      if (qrAtivo) {
        return { status: 400, body: { erro: 'QR já utilizado na manutenção' } };
      }

      const qrAtivoProducao = await consumoPecaRepo.findQrAtivo(qrInformado);
      if (qrAtivoProducao) {
        return { status: 400, body: { erro: 'QR já utilizado na produção' } };
      }

      if (qrIdInformado) {
        const qrIdExistenteManutencao = await manutencaoPecaRepo.findQrIdAny(qrIdInformado);
        if (qrIdExistenteManutencao) {
          return { status: 400, body: { erro: 'ID de QR já utilizado na manutenção' } };
        }

        const qrIdExistenteProducao = await consumoPecaRepo.findQrIdAny(qrIdInformado);
        if (qrIdExistenteProducao) {
          return { status: 400, body: { erro: 'ID de QR já utilizado na produção' } };
        }
      }
    }

    const encerradaEm = new Date();
    if (pecaAtivaAnterior) {
      await manutencaoPecaRepo.encerrarAtivaPorId(pecaAtivaAnterior.id, encerradaEm);
    }

    const peca = await manutencaoPecaRepo.create({
      id: crypto.randomUUID(),
      manutencaoId: String(id),
      manutencaoSerieId: manutencaoSerieId ? String(manutencaoSerieId) : null,
      codigoPeca: codigo,
      codigoSubproduto: subprodutoContexto?.codigoSubproduto || null,
      descricaoSubproduto: subprodutoContexto?.descricaoSubproduto || null,
      qrCode: qrInformado || null,
      qrId: qrIdInformado ? String(qrIdInformado) : null,
      quantidade: Number(quantidade) || 1,
      funcionarioId: String(funcionarioId).trim()
    });

    await manutencaoEventoRepo.create({
      id: crypto.randomUUID(),
      manutencaoId: String(id),
      tipo: 'peca_trocada',
      funcionarioId: String(funcionarioId).trim(),
      setor: setorFuncionario,
      observacao: `Peça registrada: ${codigo}`
    });

    let baixaOmie = null;
    if (Boolean(sincronizarOmie)) {
      baixaOmie = await baixarPecaEstoqueOmie({
        empresa: manutencao.empresa,
        codigoPeca: codigo,
        quantidade: Number(quantidade) || 1,
        manutencaoId: manutencao.id,
        numeroOS: manutencao.numeroOS,
        observacao: `Baixa de manutenção ${manutencao.id}`
      });
    }

    const bodyOut = {
      status: 200,
      body: {
        ok: true,
        mensagem: 'Peça trocada registrada',
        peca: {
          id: peca.id,
          codigoPeca: peca.codigoPeca,
          codigoSubproduto: peca.codigoSubproduto || null,
          descricaoSubproduto: peca.descricaoSubproduto || null,
          qrCode: peca.qrCode || null,
          qrId: peca.qrId || null,
          quantidade: peca.quantidade,
          criadoEm: peca.criadoEm,
          fimEm: peca.fimEm || null
        },
        validacaoBom
      }
    };

    if (pecaAtivaAnterior) {
      bodyOut.body.substituicao = {
        pecaAnteriorId: pecaAtivaAnterior.id,
        codigoPeca: pecaAtivaAnterior.codigoPeca,
        encerradaEm
      };
    }

    if (baixaOmie) bodyOut.body.baixaOmie = baixaOmie;

    console.info('[manutencao.pecas] sucesso', {
      manutencaoId: String(id),
      funcionarioId: String(funcionarioId).trim(),
      setor: setorFuncionario,
      codigoPeca: codigo,
      manutencaoSerieId: manutencaoSerieId ? String(manutencaoSerieId) : null
    });

    return bodyOut;
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
        erro: 'Erro interno ao registrar peça trocada na manutenção',
        codProdutoOmie,
        descricaoProduto
      }
    };
  }
}

module.exports = { execute };



