jest.mock('../src/database/prisma', () => ({
  prisma: {
    $transaction: jest.fn()
  }
}));

jest.mock('../src/repositories/expedicao.repository', () => ({
  findByIdSelect: jest.fn()
}));

jest.mock('../src/repositories/produtoFinal.repository', () => ({
  findBySerie: jest.fn()
}));

jest.mock('../src/integrations/omie/omie.facade', () => ({
  consultarPedidoVenda: jest.fn(),
  consultarEstoquePadrao: jest.fn()
}));


jest.mock('../src/domain/setorManutencao', () => ({
  SETOR_EXPEDICAO: 'expedicao',
  validarFuncionarioAtivoNoSetor: jest.fn().mockResolvedValue({ ok: true })
}));

jest.mock('../src/domain/expedicao.rules', () => ({
  produtoPossuiSerieNoSistema: jest.fn()
}));

const { prisma } = require('../src/database/prisma');
const expedicaoRepo = require('../src/repositories/expedicao.repository');
const produtoFinalRepo = require('../src/repositories/produtoFinal.repository');
const { consultarPedidoVenda, consultarEstoquePadrao } = require('../src/integrations/omie/omie.facade');
const { produtoPossuiSerieNoSistema } = require('../src/domain/expedicao.rules');
const scanSerieUsecase = require('../src/usecases/expedicao/scanSerie.usecase');

describe('Expedicao scan-serie - concorrencia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockBase() {
    expedicaoRepo.findByIdSelect.mockResolvedValue({
      id: 'exp-1',
      numeroPedido: '32397',
      empresa: 'marchi',
      status: 'ativa',
      version: 7
    });

    consultarPedidoVenda.mockResolvedValue({
      itens: [{ codProdutoOmie: 'M-ID12L', quantidade: 2 }]
    });

    produtoPossuiSerieNoSistema.mockResolvedValue(true);
    produtoFinalRepo.findBySerie.mockResolvedValue({
      id: 'pf-1',
      codProdutoOmie: 'M-ID12L'
    });

    consultarEstoquePadrao.mockResolvedValue({ nSaldo: 10 });
  }

  test('deve retornar 409 quando houver conflito de concorrÃªncia no claim da expedicao', async () => {
    mockBase();

    prisma.$transaction.mockImplementation(async (cb) =>
      cb({
        expedicao: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 })
        },
        expedicaoSerie: {
          count: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn()
        }
      })
    );

    const result = await scanSerieUsecase.execute({
      params: { id: 'exp-1' },
      body: {
        codProdutoOmie: 'M-ID12L',
        serie: '3014980',
        empresa: 'marchi',
        funcionarioId: '1'
      }
    });

    expect(result.status).toBe(409);
    expect(result.body.erro).toMatch(/Conflito de concorr[eê]ncia/i);
    expect(result.body.code).toBe('CONCURRENCY_CONFLICT');
    expect(result.body.detalhe).toBeTruthy();
  });

  test('deve retornar 200 quando scan-serie ocorrer sem conflito', async () => {
    mockBase();

    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const count = jest.fn().mockResolvedValue(0);
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({
      id: 'vinc-1',
      expedicaoId: 'exp-1',
      codProdutoOmie: 'M-ID12L',
      serie: '3014980'
    });

    prisma.$transaction.mockImplementation(async (cb) =>
      cb({
        expedicao: { updateMany },
        expedicaoSerie: { count, findFirst, create }
      })
    );

    const result = await scanSerieUsecase.execute({
      params: { id: 'exp-1' },
      body: {
        codProdutoOmie: 'M-ID12L',
        serie: '3014980',
        empresa: 'marchi',
        funcionarioId: '1'
      }
    });

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.tipo).toBe('serie');
    expect(result.body.vinculo.id).toBe('vinc-1');
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
