jest.mock('../src/database/prisma', () => ({
  prisma: {
    $transaction: jest.fn()
  }
}));

jest.mock('../src/repositories/ordemProducao.repository', () => ({
  findById: jest.fn()
}));

jest.mock('../src/repositories/eventoOP.repository', () => ({
  findUltimoEvento: jest.fn(),
  create: jest.fn()
}));

jest.mock('../src/repositories/produtoFinal.repository', () => ({
  findByIdSelect: jest.fn()
}));

jest.mock('../src/repositories/subproduto.repository', () => ({
  findMesmoCodigoNoMesmoPF: jest.fn()
}));

jest.mock('../src/integrations/viaonda/viaonda.facade', () => ({
  buscarEtiquetaProdutoFinal: jest.fn(),
  buscarOP: jest.fn()
}));

jest.mock('../src/integrations/omie/omie.produto', () => ({
  validarProdutoExisteNoOmie: jest.fn()
}));

jest.mock('../src/integrations/omie/omie.estrutura', () => ({
  consultarEstruturaProduto: jest.fn(),
  extrairSubprodutosDoBOM: jest.fn()
}));

const { prisma } = require('../src/database/prisma');
const ordemRepo = require('../src/repositories/ordemProducao.repository');
const eventoRepo = require('../src/repositories/eventoOP.repository');
const produtoFinalRepo = require('../src/repositories/produtoFinal.repository');
const subprodutoRepo = require('../src/repositories/subproduto.repository');
const { buscarEtiquetaProdutoFinal, buscarOP } = require('../src/integrations/viaonda/viaonda.facade');
const { validarProdutoExisteNoOmie } = require('../src/integrations/omie/omie.produto');
const consumirSubprodutoUsecase = require('../src/usecases/subproduto/consumirSubproduto.usecase');

describe('Subproduto consumir - concorrencia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockBase() {
    ordemRepo.findById.mockResolvedValue({
      id: 'op-1',
      status: 'montagem',
      empresa: 'marchi'
    });

    eventoRepo.findUltimoEvento.mockResolvedValue({ tipo: 'inicio' });

    produtoFinalRepo.findByIdSelect.mockResolvedValue({
      id: 'pf-1',
      opId: 'op-1',
      codProdutoOmie: null
    });

    subprodutoRepo.findMesmoCodigoNoMesmoPF.mockResolvedValue(null);
    buscarEtiquetaProdutoFinal.mockResolvedValue([{ serie: '3011284' }]);
    buscarOP.mockResolvedValue([{ codigo: 'M-ID40_V6_PCB_MONT' }]);
    validarProdutoExisteNoOmie.mockResolvedValue(true);
  }

  function bodyBase() {
    return {
      opId: 'op-1',
      serieProdFinalId: 'pf-1',
      opNumeroSubproduto: '2025/01478',
      serie: '3011284',
      funcionarioId: '1',
      codigoSubproduto: 'M-ID40_V6_PCB_MONT',
      empresa: 'marchi'
    };
  }

  test('deve retornar 409 quando houver conflito de concorrencia na vinculacao da etiqueta existente', async () => {
    mockBase();

    prisma.$transaction.mockImplementation(async (cb) =>
      cb({
        subproduto: {
          findUnique: jest.fn().mockResolvedValue({ etiquetaId: '3011284', serieProdFinalId: null }),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn()
        }
      })
    );

    const result = await consumirSubprodutoUsecase.execute(bodyBase());

    expect(result.status).toBe(409);
    expect(result.body.erro).toMatch(/Conflito de concorrencia/i);
    expect(result.body.code).toBe('CONCURRENCY_CONFLICT');
    expect(result.body.detalhe).toBeTruthy();
  });

  test('deve retornar 200 quando consumir sem conflito', async () => {
    mockBase();

    const createTx = jest.fn().mockResolvedValue({
      id: 'sub-1',
      etiquetaId: '3011284',
      serieProdFinalId: 'pf-1'
    });

    prisma.$transaction.mockImplementation(async (cb) =>
      cb({
        subproduto: {
          findUnique: jest.fn().mockResolvedValue(null),
          updateMany: jest.fn(),
          findUniqueOrThrow: jest.fn(),
          create: createTx
        }
      })
    );

    eventoRepo.create.mockResolvedValue({ id: 'evt-1' });

    const result = await consumirSubprodutoUsecase.execute(bodyBase());

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.subproduto.id).toBe('sub-1');
    expect(createTx).toHaveBeenCalledTimes(1);
    expect(eventoRepo.create).toHaveBeenCalledTimes(1);
  });
});
