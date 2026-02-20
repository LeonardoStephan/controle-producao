jest.mock('../src/repositories/ordemProducao.repository', () => ({
  findById: jest.fn()
}));

jest.mock('../src/repositories/produtoFinal.repository', () => ({
  findFirstCodProdutoOmieDaOp: jest.fn(),
  findBySerie: jest.fn(),
  listSeriesByOpId: jest.fn()
}));

jest.mock('../src/integrations/viaonda/viaonda.facade', () => ({
  buscarEtiquetaProdutoFinal: jest.fn(),
  consultarEtiquetaNfePorSerie: jest.fn(),
  normalizeSerialInput: jest.fn((v) => String(v || '').trim())
}));

jest.mock('../src/integrations/omie/omie.produto', () => ({
  consultarProdutoNoOmie: jest.fn()
}));

jest.mock('../src/domain/setorManutencao', () => ({
  SETOR_PRODUCAO: 'producao',
  SETOR_EXPEDICAO: 'expedicao',
  SETOR_MANUTENCAO: 'manutencao',
  validarFuncionarioAtivoNoSetor: jest.fn().mockResolvedValue({ ok: true }),
  obterSetorPorFuncionarioAsync: jest.fn().mockResolvedValue('manutencao')
}));

jest.mock('../src/repositories/manutencao.repository', () => ({
  findById: jest.fn(),
  findAtivaBySerieExcluindoId: jest.fn()
}));

jest.mock('../src/repositories/manutencaoSerie.repository', () => ({
  findByManutencaoIdAndSerie: jest.fn()
}));

jest.mock('../src/repositories/expedicao.repository', () => ({
  findUltimaExpedicaoBySerie: jest.fn(),
  findByIdSelect: jest.fn()
}));

jest.mock('../src/integrations/omie/omie.facade', () => ({
  consultarPedidoVenda: jest.fn(),
  consultarEstoquePadrao: jest.fn()
}));

const ordemRepo = require('../src/repositories/ordemProducao.repository');
const produtoFinalRepo = require('../src/repositories/produtoFinal.repository');
const viaOndaFacade = require('../src/integrations/viaonda/viaonda.facade');
const manutencaoRepo = require('../src/repositories/manutencao.repository');
const manutencaoSerieRepo = require('../src/repositories/manutencaoSerie.repository');
const expedicaoRepo = require('../src/repositories/expedicao.repository');

const criarProdutoFinalUsecase = require('../src/usecases/produtoFinal/criarProdutoFinal.usecase');
const scanSerieManutencaoUsecase = require('../src/usecases/manutencao/scanSerieManutencao.usecase');
const scanSerieExpedicaoUsecase = require('../src/usecases/expedicao/scanSerie.usecase');

describe('Consistencia - regras de validacao', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('produto-final/criar bloqueia codProdutoOmie divergente da etiqueta da serie', async () => {
    ordemRepo.findById.mockResolvedValue({
      id: 'op-1',
      numeroOP: '2026/02011',
      empresa: 'marchi'
    });
    produtoFinalRepo.findFirstCodProdutoOmieDaOp.mockResolvedValue(null);
    produtoFinalRepo.findBySerie.mockResolvedValue(null);
    produtoFinalRepo.listSeriesByOpId.mockResolvedValue([]);

    viaOndaFacade.buscarEtiquetaProdutoFinal.mockResolvedValue([
      {
        serie: '3015175',
        codigo: 'M-ID40_LIGHT_V2_ETH'
      }
    ]);

    const result = await criarProdutoFinalUsecase.execute({
      opId: 'op-1',
      serieProdutoFinal: '3015175',
      codProdutoOmie: 'M-ID40_LINUX_RTC',
      empresa: 'marchi',
      funcionarioId: 'Leonardo M. Stephan'
    });

    expect(result.status).toBe(400);
    expect(result.body.erro).toMatch(/divergente/i);
    expect(result.body.codProdutoOmieEnviado).toBe('M-ID40_LINUX_RTC');
    expect(result.body.codProdutoEsperado).toBe('M-ID40_LIGHT_V2_ETH');
  });

  test('manutencao/scan-serie bloqueia serie sem historico de expedicao', async () => {
    manutencaoRepo.findById.mockResolvedValue({
      id: 'man-1',
      numeroOS: '405',
      empresa: 'marchi',
      status: 'conferencia_manutencao',
      codProdutoOmie: null,
      clienteNome: 'Cliente X'
    });
    manutencaoSerieRepo.findByManutencaoIdAndSerie.mockResolvedValue(null);
    manutencaoRepo.findAtivaBySerieExcluindoId.mockResolvedValue(null);
    produtoFinalRepo.findBySerie.mockResolvedValue(null);
    expedicaoRepo.findUltimaExpedicaoBySerie.mockResolvedValue(null);
    viaOndaFacade.consultarEtiquetaNfePorSerie.mockResolvedValue({
      codProdutoOmie: 'M-ID12L',
      descricaoProduto: 'Produto'
    });

    const result = await scanSerieManutencaoUsecase.execute({
      params: { id: 'man-1' },
      body: { serieProduto: '3014980', funcionarioId: 'Fernando I. Rodrigues' }
    });

    expect(result.status).toBe(400);
    expect(result.body.erro).toMatch(/sem histórico de expedição/i);
  });

  test('manutencao/scan-serie bloqueia quando ultima expedicao nao esta finalizada', async () => {
    manutencaoRepo.findById.mockResolvedValue({
      id: 'man-1',
      numeroOS: '405',
      empresa: 'marchi',
      status: 'conferencia_manutencao',
      codProdutoOmie: null,
      clienteNome: 'Cliente X'
    });
    manutencaoSerieRepo.findByManutencaoIdAndSerie.mockResolvedValue(null);
    manutencaoRepo.findAtivaBySerieExcluindoId.mockResolvedValue(null);
    produtoFinalRepo.findBySerie.mockResolvedValue(null);
    expedicaoRepo.findUltimaExpedicaoBySerie.mockResolvedValue({
      id: 'exp-1',
      numeroPedido: '32397',
      empresa: 'marchi',
      status: 'ativa'
    });
    viaOndaFacade.consultarEtiquetaNfePorSerie.mockResolvedValue({
      codProdutoOmie: 'M-ID12L',
      descricaoProduto: 'Produto'
    });

    const result = await scanSerieManutencaoUsecase.execute({
      params: { id: 'man-1' },
      body: { serieProduto: '3014980', funcionarioId: 'Fernando I. Rodrigues' }
    });

    expect(result.status).toBe(400);
    expect(result.body.erro).toMatch(/ainda não finalizada/i);
    expect(result.body.statusExpedicao).toBe('ativa');
  });

  test('expedicao/scan-serie bloqueia empresa divergente', async () => {
    expedicaoRepo.findByIdSelect.mockResolvedValue({
      id: 'exp-1',
      numeroPedido: '32397',
      empresa: 'marchi',
      status: 'ativa',
      version: 1
    });

    const result = await scanSerieExpedicaoUsecase.execute({
      params: { id: 'exp-1' },
      body: {
        empresa: 'gs',
        codProdutoOmie: 'M-ID12L',
        serie: '3014980',
        funcionarioId: 'Leonardo M. Stephan'
      }
    });

    expect(result.status).toBe(400);
    expect(result.body.erro).toMatch(/pertence a empresa|pertence à empresa/i);
  });
});

