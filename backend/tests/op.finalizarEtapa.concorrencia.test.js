jest.mock('../src/database/prisma', () => ({
  prisma: {
    $transaction: jest.fn()
  }
}));

jest.mock('../src/repositories/ordemProducao.repository', () => ({
  findById: jest.fn()
}));

jest.mock('../src/repositories/eventoOP.repository', () => ({
  findUltimoEvento: jest.fn()
}));

jest.mock('../src/repositories/produtoFinal.repository', () => ({
  existsAnyByOpId: jest.fn()
}));

jest.mock('../src/repositories/subproduto.repository', () => ({
  countRegistradosNaOp: jest.fn(),
  countConsumidosNaOpAgrupado: jest.fn()
}));

const { prisma } = require('../src/database/prisma');
const ordemRepo = require('../src/repositories/ordemProducao.repository');
const eventoRepo = require('../src/repositories/eventoOP.repository');
const produtoFinalRepo = require('../src/repositories/produtoFinal.repository');
const finalizarEtapaUsecase = require('../src/usecases/op/finalizarEtapa.usecase');

describe('OP finalizarEtapa - concorrencia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockBase() {
    ordemRepo.findById.mockResolvedValue({
      id: 'op-1',
      status: 'teste',
      version: 5,
      tipoOp: 'produto_final',
      quantidadeProduzida: 1,
      empresa: 'marchi'
    });

    eventoRepo.findUltimoEvento.mockResolvedValue({ tipo: 'inicio' });
    produtoFinalRepo.existsAnyByOpId.mockResolvedValue(true);
  }

  test('deve retornar 409 quando houver conflito de concorrencia no update de status', async () => {
    mockBase();

    prisma.$transaction.mockImplementation(async (cb) =>
      cb({
        eventoOP: { create: jest.fn().mockResolvedValue({ id: 'evt-1' }) },
        ordemProducao: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }
      })
    );

    const result = await finalizarEtapaUsecase.execute({
      params: { id: 'op-1', etapa: 'teste' },
      body: { funcionarioId: '1' }
    });

    expect(result.status).toBe(409);
    expect(result.body.erro).toMatch(/Conflito de concorrencia/i);
    expect(result.body.code).toBe('CONCURRENCY_CONFLICT');
    expect(result.body.detalhe).toBeTruthy();
  });

  test('deve retornar 200 quando finalizar sem conflito', async () => {
    mockBase();

    const create = jest.fn().mockResolvedValue({ id: 'evt-1' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (cb) =>
      cb({
        eventoOP: { create },
        ordemProducao: { updateMany }
      })
    );

    const result = await finalizarEtapaUsecase.execute({
      params: { id: 'op-1', etapa: 'teste' },
      body: { funcionarioId: '1' }
    });

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.etapaFinalizada).toBe('teste');
    expect(create).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
