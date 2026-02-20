jest.mock('../src/database/prisma', () => ({
  prisma: {
    $transaction: jest.fn()
  }
}));

jest.mock('../src/repositories/ordemProducao.repository', () => ({
  findById: jest.fn()
}));

jest.mock('../src/domain/setorManutencao', () => ({
  SETOR_PRODUCAO: 'producao',
  validarFuncionarioAtivoNoSetor: jest.fn().mockResolvedValue({ ok: true })
}));

const { prisma } = require('../src/database/prisma');
const ordemRepo = require('../src/repositories/ordemProducao.repository');
const adicionarEventoUsecase = require('../src/usecases/op/adicionarEvento.usecase');

describe('OP adicionarEvento - concorrencia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('deve retornar 409 quando houver conflito de concorrÃªncia (version/status mudou)', async () => {
    ordemRepo.findById.mockResolvedValue({
      id: 'op-1',
      status: 'montagem',
      version: 3
    });

    prisma.$transaction.mockImplementation(async (cb) =>
      cb({
        ordemProducao: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 })
        },
        eventoOP: {
          findFirst: jest.fn(),
          create: jest.fn()
        }
      })
    );

    const result = await adicionarEventoUsecase.execute({
      params: { id: 'op-1' },
      body: { tipo: 'pausa', funcionarioId: '1' }
    });

    expect(result.status).toBe(409);
    expect(result.body.erro).toMatch(/Conflito de concorr[eê]ncia/i);
    expect(result.body.code).toBe('CONCURRENCY_CONFLICT');
    expect(result.body.detalhe).toBeTruthy();
  });

  test('deve retornar 200 quando nÃ£o houver conflito e sequÃªncia for vÃ¡lida', async () => {
    ordemRepo.findById.mockResolvedValue({
      id: 'op-1',
      status: 'montagem',
      version: 3
    });

    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirst = jest.fn().mockResolvedValue({ tipo: 'inicio' });
    const create = jest.fn().mockResolvedValue({ id: 'evt-1' });

    prisma.$transaction.mockImplementation(async (cb) =>
      cb({
        ordemProducao: { updateMany },
        eventoOP: { findFirst, create }
      })
    );

    const result = await adicionarEventoUsecase.execute({
      params: { id: 'op-1' },
      body: { tipo: 'pausa', funcionarioId: '1' }
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
