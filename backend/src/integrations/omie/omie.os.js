const { postOmie } = require('./omie.http');

const ORDEM_SERVICO_CACHE_TTL_MS = Number(process.env.OMIE_OS_CACHE_TTL_MS || 60_000);
const ordemServicoCache = new Map();
const ordemServicoInFlight = new Map();

function getOrdemServicoEndpoint() {
  return process.env.OMIE_OS_ENDPOINT || 'https://app.omie.com.br/api/v1/servicos/os/';
}

function getEstoqueEndpoint() {
  return process.env.OMIE_ESTOQUE_ENDPOINT || 'https://app.omie.com.br/api/v1/estoque/ajuste/';
}

function normalizeToken(v) {
  return String(v || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function isLikelyProductCode(token) {
  if (!token) return false;
  // evita falso positivo em codigos muito curtos/numericos
  if (token.length < 3) return false;
  if (/^\d+$/.test(token)) return false;
  return /^[A-Z0-9][A-Z0-9._-]*$/.test(token);
}

function extractCodeFromText(text) {
  const input = String(text || '');
  if (!input.trim()) return null;

  // casos comuns no texto da OS:
  // "04- Controlador Guara- MCGU|..."
  // "01- M-id10W_v6 - Leitor..."
  const patterns = [
    /\b\d{1,3}\s*-\s*[^|\n\r]*?\s-\s*([A-Za-z0-9][A-Za-z0-9._-]{2,})\b/g,
    /\b\d{1,3}\s*-\s*([A-Za-z0-9][A-Za-z0-9._-]{2,})\b/g,
    /\b([A-Za-z0-9][A-Za-z0-9._-]{2,})\s*-\s*Leitor\b/gi
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(input)) !== null) {
      const token = normalizeToken(m[1]);
      if (isLikelyProductCode(token)) return token;
    }
  }

  return null;
}

function extractProductCodeFromOS(data) {
  const servicos = Array.isArray(data?.ServicosPrestados) ? data.ServicosPrestados : [];
  for (const item of servicos) {
    const byDesc = extractCodeFromText(item?.cDescServ);
    if (byDesc) return byDesc;
  }

  const byObs = extractCodeFromText(data?.Observacoes?.cObsOS);
  if (byObs) return byObs;

  return null;
}

async function consultarOrdemServico(numeroOS, empresa) {
  const os = String(numeroOS || '').trim();
  const emp = String(empresa || '').trim();
  if (!os || !emp) return null;

  const key = `${emp}::${os}`;
  const now = Date.now();
  const cached = ordemServicoCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const inFlight = ordemServicoInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const endpoint = getOrdemServicoEndpoint();
      const call = process.env.OMIE_OS_CONSULTAR_CALL || 'ConsultarOS';

      const resp = await postOmie({
        endpoint,
        empresa: emp,
        call,
        param: [{
          cCodIntOS: '',
          nCodOS: 0,
          cNumOS: os
        }],
        timeout: 30000
      });

      if (!resp.ok) return null;

      const data = resp.data || {};
      const cab = data.Cabecalho || {};
      const add = data.InformacoesAdicionais || {};
      const email = data.Email || {};
      const codProdutoExtraido = extractProductCodeFromOS(data);

      const value = {
        numeroOS: String(cab.cNumOS || os),
        nCodOS: cab.nCodOS || null,
        clienteNome: add.cContato || null,
        clienteEmail: String(email.cEnviarPara || '').trim() || null,
        codProdutoOmie: codProdutoExtraido,
        etapa: cab.cEtapa || null,
        valorTotal: cab.nValorTotal || null,
        raw: data
      };

      ordemServicoCache.set(key, { value, expiresAt: now + ORDEM_SERVICO_CACHE_TTL_MS });
      return value;
    } finally {
      ordemServicoInFlight.delete(key);
    }
  })();

  ordemServicoInFlight.set(key, promise);
  return promise;
}

async function baixarPecaEstoqueOmie({
  empresa,
  codigoPeca,
  quantidade,
  manutencaoId,
  numeroOS,
  observacao
}) {
  const endpoint = getEstoqueEndpoint();
  const call = process.env.OMIE_ESTOQUE_BAIXA_CALL || 'LancarBaixaEstoque';

  const payload = {
    codigo: String(codigoPeca || '').trim(),
    quantidade: Number(quantidade || 1),
    tipo: 'saida',
    observacao:
      observacao ||
      `Baixa manutencao ${String(manutencaoId || '').trim()} / OS ${String(numeroOS || '').trim()}`
  };

  const resp = await postOmie({
    endpoint,
    empresa,
    call,
    param: [payload],
    timeout: 30000
  });

  if (!resp.ok) {
    return { ok: false, erro: 'Falha ao baixar peça no OMIE', detalhe: resp.error || null };
  }

  return { ok: true, data: resp.data || null };
}

module.exports = {
  consultarOrdemServico,
  baixarPecaEstoqueOmie,
  extractProductCodeFromOS,
  extractCodeFromText
};
