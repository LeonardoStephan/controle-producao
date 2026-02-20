jest.mock('../src/repositories/manutencao.repository', () => ({
  findById: jest.fn()
}));

jest.mock('../src/repositories/manutencaoPecaTrocada.repository', () => ({
  findAtivaPorCodigo: jest.fn(),
  existeHistoricoComQr: jest.fn(),
  findQrAtivo: jest.fn(),
  findQrIdAtivo: jest.fn(),
  encerrarAtivaPorId: jest.fn(),
  create: jest.fn()
}));

jest.mock('../src/repositories/manutencaoSerie.repository', () => ({
  findByManutencaoId: jest.fn()
}));

jest.mock('../src/repositories/manutencaoEvento.repository', () => ({
  create: jest.fn()
}));

jest.mock('../src/repositories/consumoPeca.repository', () => ({
  existeHistoricoComQr: jest.fn(),
  findQrAtivo: jest.fn(),
  findQrIdAtivo: jest.fn()
}));

jest.mock('../src/repositories/subproduto.repository', () => ({
  findManyBySerieProdFinalId: jest.fn()
}));

jest.mock('../src/repositories/produtoFinal.repository', () => ({
  findBySerie: jest.fn()
}));

jest.mock('../src/integrations/omie/omie.estrutura', () => ({
  estruturaTemItem: jest.fn(),
  consultarEstruturaProduto: jest.fn(),
  extrairSubprodutosDoBOM: jest.fn()
}));

jest.mock('../src/integrations/omie/omie.facade', () => ({
  baixarPecaEstoqueOmie: jest.fn()
}));

jest.mock('../src/integrations/omie/omie.produto', () => ({
  consultarProdutoNoOmie: jest.fn()
}));

const manutencaoRepo = require('../src/repositories/manutencao.repository');
const manutencaoPecaRepo = require('../src/repositories/manutencaoPecaTrocada.repository');
const manutencaoSerieRepo = require('../src/repositories/manutencaoSerie.repository');
const manutencaoEventoRepo = require('../src/repositories/manutencaoEvento.repository');
const consumoPecaRepo = require('../src/repositories/consumoPeca.repository');
const { estruturaTemItem } = require('../src/integrations/omie/omie.estrutura');
const { consultarProdutoNoOmie } = require('../src/integrations/omie/omie.produto');
const usecase = require('../src/usecases/manutencao/registrarPecaTrocadaManutencao.usecase');

describe('Manutencao - registrar peca validacoes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    manutencaoRepo.findById.mockResolvedValue({
      id: 'man-1',
      empresa: 'marchi',
      status: 'reparo',
      codProdutoOmie: null,
      serieProdFinalId: null,
      numeroOS: '405'
    });
    manutencaoSerieRepo.findByManutencaoId.mockResolvedValue([]);
    manutencaoPecaRepo.findAtivaPorCodigo.mockResolvedValue(null);
    manutencaoPecaRepo.existeHistoricoComQr.mockResolvedValue(false);
    manutencaoPecaRepo.findQrAtivo.mockResolvedValue(null);
    manutencaoPecaRepo.findQrIdAtivo.mockResolvedValue(null);
    manutencaoPecaRepo.create.mockResolvedValue({
      id: 'peca-1',
      codigoPeca: 'MOD_RTC',
      codigoSubproduto: null,
      descricaoSubproduto: null,
      qrCode: null,
      qrId: null,
      quantidade: 1,
      criadoEm: new Date(),
      fimEm: null
    });
    manutencaoEventoRepo.create.mockResolvedValue({});
    consumoPecaRepo.existeHistoricoComQr.mockResolvedValue(false);
    consumoPecaRepo.findQrAtivo.mockResolvedValue(null);
    consumoPecaRepo.findQrIdAtivo.mockResolvedValue(null);
    estruturaTemItem.mockResolvedValue(true);
    consultarProdutoNoOmie.mockResolvedValue({ descricao: 'Produto teste' });
  });

  test('bloqueia quando ha series de produtos diferentes e manutencaoSerieId nao foi informado', async () => {
    manutencaoSerieRepo.findByManutencaoId.mockResolvedValue([
      { id: 's1', serie: '3001', codProdutoOmie: 'PROD_A', serieProdFinalId: null },
      { id: 's2', serie: '3002', codProdutoOmie: 'PROD_B', serieProdFinalId: null }
    ]);

    const result = await usecase.execute({
      params: { id: 'man-1' },
      body: {
        codigoPeca: 'MOD_RTC',
        funcionarioId: 'Fernando'
      }
    });

    expect(result.status).toBe(400);
    expect(result.body.erro).toMatch(/manutencaoSerieId/);
  });

  test('bloqueia quando qrCode nao corresponde ao codigoPeca', async () => {
    const result = await usecase.execute({
      params: { id: 'man-1' },
      body: {
        codigoPeca: 'MOD_RTC',
        funcionarioId: 'Fernando',
        qrCode: '06/02/2026 09:25:30;OUTRA_PECA;fab;123;456;06/02/2026;Limeira;ID:1770380730990'
      }
    });

    expect(result.status).toBe(400);
    expect(result.body.erro).toMatch(/nao corresponde ao codigo da peca/i);
  });

  test('bloqueia quando qrId ja esta ativo na producao', async () => {
    consumoPecaRepo.findQrIdAtivo.mockResolvedValue({ id: 'cons-1', qrId: 'ID:1770380730990' });

    const result = await usecase.execute({
      params: { id: 'man-1' },
      body: {
        codigoPeca: 'MOD_RTC',
        funcionarioId: 'Fernando',
        qrCode: '06/02/2026 09:25:30;MOD_RTC;fab;123;456;06/02/2026;Limeira;ID:1770380730990'
      }
    });

    expect(result.status).toBe(400);
    expect(result.body.erro).toMatch(/ID de QR ja utilizado na producao/i);
  });
});
