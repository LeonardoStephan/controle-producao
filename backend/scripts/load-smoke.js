/* eslint-disable no-console */
const autocannon = require('autocannon');

function runLoad(opts) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(opts, (err, result) => {
      if (err) return reject(err);
      return resolve(result);
    });
    autocannon.track(instance, { renderProgressBar: false });
  });
}

async function main() {
  const baseUrl = process.env.LOAD_BASE_URL || 'http://localhost:3333';
  const duration = Number(process.env.LOAD_DURATION || 10);
  const connections = Number(process.env.LOAD_CONNECTIONS || 25);

  console.log(`\nRunning load smoke test on ${baseUrl}/health`);
  console.log(`duration=${duration}s connections=${connections}\n`);

  const result = await runLoad({
    url: `${baseUrl}/health`,
    duration,
    connections,
    pipelining: 1,
    method: 'GET'
  });

  const statusCodes = result.statusCodeStats || {};
  const totalErrors = Number(result.errors || 0) + Number(result.timeouts || 0);
  const non2xx = Object.keys(statusCodes)
    .filter((code) => !String(code).startsWith('2'))
    .reduce((acc, code) => acc + Number(statusCodes[code]?.count || 0), 0);

  console.log('\nLoad summary:');
  console.log(`requests total: ${result.requests?.total || 0}`);
  console.log(`errors/timeouts: ${totalErrors}`);
  console.log(`non-2xx responses: ${non2xx}`);
  console.log(`p95 latency (ms): ${result.latency?.p95 || 0}`);

  if (totalErrors > 0 || non2xx > 0) {
    console.error('\nLoad smoke test failed.');
    process.exit(1);
  }

  console.log('\nLoad smoke test passed.');
}

main().catch((err) => {
  console.error('Erro executando load smoke test:', err.message);
  process.exit(1);
});
