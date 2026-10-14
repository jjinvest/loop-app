const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = require('../src/server');

async function request(baseUrl, route, method = 'GET', body) {
  const response = await fetch(baseUrl + route, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const raw = await response.text();
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  return { status: response.status, data: isJson ? JSON.parse(raw) : raw };
}

test('servidor, interface, filas e catraca do LOOP', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  }));
  const baseUrl = 'http://127.0.0.1:' + server.address().port;

  const health = await request(baseUrl, '/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.status, 'online');

  const page = await request(baseUrl, '/');
  assert.equal(page.status, 200);
  assert.match(page.data, /LOOP — Escritório Virtual/);

  const script = await request(baseUrl, '/js/app.js');
  assert.equal(script.status, 200);

  const initial = await request(baseUrl, '/filas');
  assert.equal(initial.data.A.quantidade, 0);
  assert.equal(initial.data.B.quantidade, 0);

  const entering = await request(baseUrl, '/filas/entrar', 'POST', { nome: 'Teste LOOP' });
  assert.equal(entering.status, 201);
  const id = entering.data.pessoa.id;
  assert.ok(id);

  const waiting = await request(baseUrl, '/filas');
  assert.equal(waiting.data.B.quantidade, 1);

  const promoting = await request(baseUrl, '/filas/promover/' + id, 'POST');
  assert.equal(promoting.status, 200);

  const promoted = await request(baseUrl, '/filas');
  assert.equal(promoted.data.A.quantidade, 1);
  assert.equal(promoted.data.B.quantidade, 0);

  const blocked = await request(baseUrl, '/catraca/liberar', 'POST');
  assert.equal(blocked.status, 409);

  const resumed = await request(baseUrl, '/catraca/retomar', 'POST');
  assert.equal(resumed.status, 200);
  assert.equal(resumed.data.catraca.status, 'ABERTA');

  const simulation = await request(baseUrl, '/catraca/liberar', 'POST');
  assert.equal(simulation.status, 200);
  assert.equal(simulation.data.catraca.liberacoes, 1);

  const paused = await request(baseUrl, '/catraca/pausar', 'POST');
  assert.equal(paused.data.catraca.status, 'PAUSADA');
  assert.equal((await request(baseUrl, '/catraca/liberar', 'POST')).status, 409);
});

test('interface mostra quantidades recebidas das filas A e B', async () => {
  const elements = {
    totalA: { textContent: '0' },
    totalB: { textContent: '0' }
  };
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
  const context = {
    fetch: async () => ({ json: async () => ({
      A: { quantidade: 3 },
      B: { quantidade: 7 }
    }) }),
    document: { getElementById: (id) => elements[id] }
  };
  await vm.runInNewContext(script + '\natualizarFilas();', context);
  assert.equal(elements.totalA.textContent, 3);
  assert.equal(elements.totalB.textContent, 7);
});
