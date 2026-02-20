jest.mock('../src/database/prisma', () => ({
  prisma: {
    $transaction: jest.fn()
  }
}));

jest.mock('../src/repositories/expedicao.repository', () => ({
  findByIdIncludeSeries: jest.fn()
}));

jest.mock('../src/repositories/fotoExpedicaoGeral.repository', () => ({
  countByExpedicaoId: jest.fn()
}));

jest.mock('../src/integrations/omie/omie.facade', () => ({
  consultarPedidoVenda: jest.fn()
}));

jest.mock('../src/domain/expedicao.rules', () => ({
  produtoPossuiSerieNoSistema: jest.fn()
}));

jest.mock('../src/repositories/funcionario.repository', () => ({
  findByCracha: jest.fn()
}));

const { prisma } = require('../src/database/prisma');
const expedicaoRepo = require('../src/repositories/expedicao.repository');
const funcionarioRepo = require('../src/repositories/funcionario.repository');
const { consultarPedidoVenda } = require('../src/integrations/omie/omie.facade');
const { produtoPossuiSerieNoSistema } = require('../src/domain/expedicao.rules');
const finalizarExpedicaoUsecase = require('../src/usecases/expedicao/finalizarExpedicao.usecase');

describe('Expedicao finalizar - concorrencia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    funcionarioRepo.findByCracha.mockResolvedValue({
      id: 'f-prod-1',
      cracha: '1',
      nome: 'Operador Expedicao',
      setores: 'expedicao',
      ativo: true
    });
  });

  function mockBase() {
    expedicaoRepo.findByIdIncludeSeries.mockResolvedValue({
      id: 'exp-1',
      numeroPedido: '32397',
      empresa: 'marchi',
      status: 'ativa',
      version: 11,
      series: [{ codProdutoOmie: 'M-ID12L', serie: '3014980' }]
    });

    consultarPedidoVenda.mockResolvedValue({
      itens: [{ codProdutoOmie: 'M-ID12L', quantidade: 1 }]
    });

    produtoPossuiSerieNoSistema.mockResolvedValue(true);
  }

  test('deve retornar 409 quando houver conflito de concorrência na finalizacao', async () => {
    mockBase();

    prisma.$transaction.mockImplementation(async (cb) =>
      cb({
        eventoExpedicao: { create: jest.fn().mockResolvedValue({ id: 'evt-1' }) },
        expedicao: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }
      })
    );

    const result = await finalizarExpedicaoUsecase.execute({
      params: { id: 'exp-1' },
      body: { funcionarioId: '1' }
    });

    expect(result.status).toBe(409);
    expect(result.body.erro).toMatch(/Conflito de concorr[eê]ncia/i);
    expect(result.body.code).toBe('CONCURRENCY_CONFLICT');
    expect(result.body.detalhe).toBeTruthy();
  });

  test('deve retornar 200 quando finalizar sem conflito', async () => {
    mockBase();

    const create = jest.fn().mockResolvedValue({ id: 'evt-1' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (cb) =>
      cb({
        eventoExpedicao: { create },
        expedicao: { updateMany }
      })
    );

    const result = await finalizarExpedicaoUsecase.execute({
      params: { id: 'exp-1' },
      body: { funcionarioId: '1' }
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true, status: 'finalizada' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
