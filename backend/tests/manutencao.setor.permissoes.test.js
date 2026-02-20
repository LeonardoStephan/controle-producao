jest.mock('../src/repositories/manutencao.repository', () => ({
  findById: jest.fn()
}));

jest.mock('../src/repositories/manutencaoSerie.repository', () => ({
  findByManutencaoId: jest.fn()
}));

jest.mock('../src/repositories/funcionario.repository', () => ({
  findByCracha: jest.fn()
}));

jest.mock('../src/integrations/viaonda/viaonda.facade', () => ({
  viaOndaTemEtiqueta: jest.fn().mockResolvedValue(false)
}));

const manutencaoRepo = require('../src/repositories/manutencao.repository');
const manutencaoSerieRepo = require('../src/repositories/manutencaoSerie.repository');
const funcionarioRepo = require('../src/repositories/funcionario.repository');
const { obterSetorPorFuncionarioAsync, validarSetorDoFuncionarioAsync } = require('../src/domain/setorManutencao');
const abrirUsecase = require('../src/usecases/manutencao/abrirManutencao.usecase');
const avancarUsecase = require('../src/usecases/manutencao/avancarEtapaManutencao.usecase');
const scanSerieUsecase = require('../src/usecases/manutencao/scanSerieManutencao.usecase');
const registrarPecaUsecase = require('../src/usecases/manutencao/registrarPecaTrocadaManutencao.usecase');
const finalizarUsecase = require('../src/usecases/manutencao/finalizarManutencao.usecase');

describe('Manutencao - permissoes por setor (cracha no banco)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    manutencaoSerieRepo.findByManutencaoId.mockResolvedValue([]);
    funcionarioRepo.findByCracha.mockImplementation(async (cracha) => {
      const c = String(cracha || '').trim().toLowerCase();
      if (c === 'idalha') {
        return { id: 'f1', cracha: 'Idalha', nome: 'Idalha', setores: 'financeiro', ativo: true };
      }
      if (c === 'fernando') {
        return { id: 'f2', cracha: 'Fernando', nome: 'Fernando', setores: 'manutencao', ativo: true };
      }
      return null;
    });
  });

  test('mapeia cracha para setor corretamente via banco', async () => {
    await expect(obterSetorPorFuncionarioAsync('Idalha')).resolves.toBe('financeiro');
    await expect(obterSetorPorFuncionarioAsync('Fernando')).resolves.toBe('manutencao');
  });

  test('validacao de setor por status: Idalha pode conferencia_inicial', async () => {
    const check = await validarSetorDoFuncionarioAsync('Idalha', 'conferencia_inicial');
    expect(check.ok).toBe(true);
    expect(check.setor).toBe('financeiro');
  });

  test('validacao de setor por status: Fernando pode reparo', async () => {
    const check = await validarSetorDoFuncionarioAsync('Fernando', 'reparo');
    expect(check.ok).toBe(true);
    expect(check.setor).toBe('manutencao');
  });

  test('abrir: bloqueia funcionario de manutencao', async () => {
    const result = await abrirUsecase.execute({
      numeroOS: '405',
      empresa: 'marchi',
      funcionarioId: 'Fernando'
    });

    expect(result.status).toBe(403);
    expect(result.body.erro).toMatch(/financeiro/i);
  });

  test('avancar: bloqueia funcionario financeiro em etapa de manutencao', async () => {
    manutencaoRepo.findById.mockResolvedValue({
      id: 'man-1',
      numeroOS: '405',
      empresa: 'marchi',
      status: 'conferencia_inicial',
      codProdutoOmie: null,
      emGarantia: null,
      aprovadoOrcamento: null,
      diagnostico: null,
      dataAprovacao: null,
      dataEntrada: new Date(),
      version: 1
    });

    const result = await avancarUsecase.execute({
      params: { id: 'man-1' },
      body: { status: 'conferencia_manutencao', funcionarioId: 'Idalha' }
    });

    expect(result.status).toBe(403);
    expect(result.body.erro).toMatch(/setor/i);
  });

  test('scan-serie: bloqueia financeiro', async () => {
    const result = await scanSerieUsecase.execute({
      params: { id: 'man-1' },
      body: { serieProduto: '3006163', funcionarioId: 'Idalha' }
    });

    expect(result.status).toBe(403);
    expect(result.body.erro).toMatch(/manuten/i);
  });

  test('registrar peca: bloqueia financeiro', async () => {
    const result = await registrarPecaUsecase.execute({
      params: { id: 'man-1' },
      body: { codigoPeca: 'MOD_RTC', funcionarioId: 'Idalha' }
    });

    expect(result.status).toBe(403);
    expect(result.body.erro).toMatch(/manuten/i);
  });

  test('finalizar: bloqueia financeiro', async () => {
    const result = await finalizarUsecase.execute({
      params: { id: 'man-1' },
      body: { funcionarioId: 'Idalha' }
    });

    expect(result.status).toBe(403);
    expect(result.body.erro).toMatch(/manuten/i);
  });
});

