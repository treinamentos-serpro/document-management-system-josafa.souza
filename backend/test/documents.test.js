const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtemp, readdir, readFile, rm, unlink } = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Readable } = require('node:stream');
const http = require('node:http');
const { createApp } = require('../src/app');
const { createDocumentsRepository } = require('../src/repositories/documents.repository');
const { createDocumentsService } = require('../src/services/documents.service');

async function setup(t, { maxFileSize = 32 } = {}) {
  const directory = await mkdtemp(path.resolve(__dirname, '../storage/test-'));
  const repository = createDocumentsRepository({ storageDirectory: directory });
  const app = createApp({ repository, maxFileSize });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    await rm(directory, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    repository,
    directory,
    get(route, owner = 'alice') {
      return fetch(`${url}${route}`, { headers: { 'X-User-Id': owner } });
    },
    post(body, owner = 'alice', headers = {}) {
      return fetch(`${url}/upload`, {
        method: 'POST',
        headers: { 'X-User-Id': owner, ...headers },
        body,
      });
    },
    url,
  };
}

function fileForm(content = 'documento', name = 'relatorio.txt', field = 'file') {
  const form = new FormData();
  form.append(field, new Blob([content], { type: 'application/octet-stream' }), name);
  return form;
}

async function expectError(response, status, code) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message']);
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, 'string');
  assert.ok(body.error.message.length > 0);
}

test('preserva o endpoint de saúde', async (t) => {
  const api = await setup(t);
  const response = await fetch(`${api.url}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('grava em disco e retorna somente metadados públicos', async (t) => {
  const api = await setup(t);
  const content = Buffer.from([0, 1, 127, 255]);
  const response = await api.post(fileForm(content, 'arquivo.bin'), ' alice ');
  assert.equal(response.status, 201);
  const { document } = await response.json();
  assert.deepEqual(Object.keys(document).sort(), ['id', 'originalName', 'owner', 'size', 'uploadedAt']);
  assert.match(document.id, /^[0-9a-f-]{36}$/);
  assert.equal(document.owner, 'alice');
  assert.equal(document.originalName, 'arquivo.bin');
  assert.equal(document.size, content.length);
  assert.equal(new Date(document.uploadedAt).toISOString(), document.uploadedAt);
  const files = await readdir(api.directory);
  assert.equal(files.length, 1);
  assert.notEqual(files[0], 'arquivo.bin');
  assert.deepEqual(await readFile(path.join(api.directory, files[0])), content);
});

test('lista somente documentos do dono, do mais recente para o mais antigo', async (t) => {
  const api = await setup(t);
  assert.deepEqual(await (await api.get('/documents')).json(), { documents: [] });
  const first = (await (await api.post(fileForm('1', 'primeiro.txt'))).json()).document;
  await api.post(fileForm('outro'), 'bob');
  const second = (await (await api.post(fileForm('2', 'segundo.txt'))).json()).document;
  const response = await api.get('/documents');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { documents: [second, first] });
});

test('download preserva o conteúdo binário e o nome original', async (t) => {
  const api = await setup(t);
  const content = Buffer.from([0, 255, 128, 10]);
  const { document } = await (await api.post(fileForm(content, 'dados.bin'))).json();
  const response = await api.get(`/documents/${document.id}/download`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.match(response.headers.get('content-disposition'), /attachment; filename="dados.bin"/);
  assert.equal(response.headers.get('content-length'), String(content.length));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), content);
});

test('todas as rotas exigem usuário antes de gravar arquivos', async (t) => {
  const api = await setup(t);
  for (const owner of [undefined, '   ']) {
    for (const route of ['/upload', '/documents', `/documents/${randomUUID()}/download`]) {
      const response = await fetch(`${api.url}${route}`, {
        method: route === '/upload' ? 'POST' : 'GET',
        headers: owner === undefined ? {} : { 'X-User-Id': owner },
        body: route === '/upload' ? fileForm() : undefined,
      });
      await expectError(response, 400, 'USER_ID_REQUIRED');
    }
  }
  assert.deepEqual(await readdir(api.directory), []);
});

test('recusa arquivo ausente, campo errado, múltiplos arquivos e multipart inválido', async (t) => {
  const api = await setup(t);
  await expectError(await api.post(new FormData()), 400, 'FILE_REQUIRED');
  await expectError(await api.post(fileForm('x', 'x.txt', 'outro')), 400, 'INVALID_UPLOAD');
  const multiple = fileForm();
  multiple.append('file', new Blob(['extra']), 'extra.txt');
  await expectError(await api.post(multiple), 400, 'INVALID_UPLOAD');
  await expectError(
    await api.post('inválido', 'alice', { 'Content-Type': 'multipart/form-data' }),
    400,
    'INVALID_UPLOAD',
  );
  await expectError(
    await api.post('--teste\r\n', 'alice', { 'Content-Type': 'multipart/form-data; boundary=teste' }),
    400,
    'INVALID_UPLOAD',
  );
  assert.deepEqual(await readdir(api.directory), []);
});

test('aceita arquivo vazio e exatamente no limite, recusando qualquer byte acima', async (t) => {
  const api = await setup(t, { maxFileSize: 32 });
  for (const size of [0, 32]) {
    const response = await api.post(fileForm(Buffer.alloc(size)));
    assert.equal(response.status, 201);
    const { document } = await response.json();
    assert.equal(document.size, size);
  }
  for (const size of [33, 34, 1024]) {
    await expectError(await api.post(fileForm(Buffer.alloc(size))), 413, 'FILE_TOO_LARGE');
  }
  assert.equal((await readdir(api.directory)).length, 2);
  assert.equal((await (await api.get('/documents')).json()).documents.length, 2);
});

test('aplica também o limite configurado em MiB em um upload real', async (t) => {
  const { maxFileSize } = require('../src/config');
  const api = await setup(t, { maxFileSize });
  const accepted = await api.post(fileForm(Buffer.alloc(maxFileSize)));
  assert.equal(accepted.status, 201);
  const { document } = await accepted.json();
  assert.equal(document.size, maxFileSize);
  await expectError(
    await api.post(fileForm(Buffer.alloc(maxFileSize + 1))),
    413,
    'FILE_TOO_LARGE',
  );
  assert.equal((await readdir(api.directory)).length, 1);
});

test('não revela documentos de outro usuário e valida identificadores', async (t) => {
  const api = await setup(t);
  const { document } = await (await api.post(fileForm())).json();
  const foreign = await api.get(`/documents/${document.id}/download`, 'bob');
  const missing = await api.get(`/documents/${randomUUID()}/download`, 'bob');
  assert.equal(foreign.status, 404);
  assert.equal(missing.status, 404);
  assert.deepEqual(await foreign.json(), await missing.json());
  await expectError(await api.get('/documents/invalido/download'), 400, 'INVALID_DOCUMENT_ID');
});

test('nomes repetidos não sobrescrevem arquivos', async (t) => {
  const api = await setup(t);
  const ids = [];
  for (const text of ['primeiro', 'segundo']) {
    const { document } = await (await api.post(fileForm(text, 'igual.txt'))).json();
    ids.push(document.id);
  }
  assert.notEqual(ids[0], ids[1]);
  assert.equal((await readdir(api.directory)).length, 2);
  assert.equal(await (await api.get(`/documents/${ids[0]}/download`)).text(), 'primeiro');
  assert.equal(await (await api.get(`/documents/${ids[1]}/download`)).text(), 'segundo');
});

test('falha ao registrar metadados remove o arquivo e retorna erro seguro', async (t) => {
  const api = await setup(t);
  const logs = t.mock.method(console, 'error', () => {});
  t.mock.method(api.repository, 'save', () => { throw new Error('detalhe interno'); });
  const response = await api.post(fileForm());
  await expectError(response, 500, 'UPLOAD_FAILED');
  assert.deepEqual(await readdir(api.directory), []);
  assert.ok(logs.mock.callCount() > 0);
});

test('falhas de gravação não são tratadas como erros de entrada', async (t) => {
  const api = await setup(t);
  const logs = t.mock.method(console, 'error', () => {});
  t.mock.method(api.repository.uploadStorage, '_handleFile', (req, file, callback) => {
    file.stream.resume();
    callback(Object.assign(new Error('disco cheio'), { code: 'ENOSPC' }));
  });
  await expectError(await api.post(fileForm()), 500, 'UPLOAD_FAILED');
  assert.deepEqual(await readdir(api.directory), []);
  assert.ok(logs.mock.callCount() > 0);
});

test('falhas de listagem e arquivo ausente são reportadas sem vazar caminhos', async (t) => {
  const api = await setup(t);
  const logs = t.mock.method(console, 'error', () => {});
  const { document } = await (await api.post(fileForm())).json();
  const [stored] = await readdir(api.directory);
  await unlink(path.join(api.directory, stored));
  await expectError(await api.get(`/documents/${document.id}/download`), 500, 'DOWNLOAD_FAILED');
  t.mock.method(api.repository, 'findByOwner', () => { throw new Error('detalhe interno'); });
  await expectError(await api.get('/documents'), 500, 'DOCUMENT_LIST_FAILED');
  assert.equal(logs.mock.callCount(), 2);
});

test('novo repositório perde os metadados sem apagar arquivos existentes', async (t) => {
  const api = await setup(t);
  await api.post(fileForm());
  const restarted = createDocumentsRepository({ storageDirectory: api.directory });
  assert.deepEqual(restarted.findByOwner('alice'), []);
  assert.equal((await readdir(api.directory)).length, 1);
});

test('erro de leitura antes dos cabeçalhos retorna JSON em vez de binário', async (t) => {
  const api = await setup(t);
  const logs = t.mock.method(console, 'error', () => {});
  const { document } = await (await api.post(fileForm())).json();
  t.mock.method(api.repository, 'openFile', async () => ({
    size: 1,
    stream: new Readable({
      read() { this.destroy(new Error('falha de leitura')); },
    }),
  }));
  const response = await api.get(`/documents/${document.id}/download`);
  assert.equal(response.headers.get('content-disposition'), null);
  await expectError(response, 500, 'DOWNLOAD_FAILED');
  assert.equal(logs.mock.callCount(), 1);
});

test('erro depois do início do download encerra a transferência sem JSON adicional', async (t) => {
  const api = await setup(t);
  const logs = t.mock.method(console, 'error', () => {});
  const { document } = await (await api.post(fileForm())).json();
  t.mock.method(api.repository, 'openFile', async () => ({
    size: 100,
    stream: new Readable({
      read() {
        if (this.started) return;
        this.started = true;
        this.push(Buffer.from('parcial'));
        setImmediate(() => this.destroy(new Error('falha de streaming')));
      },
    }),
  }));
  await new Promise((resolve, reject) => {
    const request = http.get(`${api.url}/documents/${document.id}/download`, {
      headers: { 'X-User-Id': 'alice' },
    }, (response) => {
      let received = '';
      response.on('data', (chunk) => { received += chunk; });
      response.once('aborted', () => {
        try {
          assert.equal(response.statusCode, 200);
          assert.equal(response.headers['content-type'], 'application/octet-stream');
          assert.equal(received, 'parcial');
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      response.once('end', () => reject(new Error('A transferência deveria ser interrompida.')));
      response.once('error', (error) => {
        if (error.code !== 'ECONNRESET') reject(error);
      });
    });
    request.once('error', reject);
  });
  assert.equal(logs.mock.callCount(), 1);
});

test('erros do parser JSON também usam o envelope de erro', async (t) => {
  const api = await setup(t);
  await expectError(
    await api.post('{', 'alice', { 'Content-Type': 'application/json' }),
    400,
    'INVALID_REQUEST',
  );
  await expectError(
    await api.post(JSON.stringify({ large: 'x'.repeat(110 * 1024) }), 'alice', { 'Content-Type': 'application/json' }),
    413,
    'REQUEST_TOO_LARGE',
  );
});

test('registra falha de limpeza sem mascarar o erro original', async (t) => {
  const originalError = new Error('falha de metadados');
  const logs = t.mock.method(console, 'error', () => {});
  const service = createDocumentsService({
    save() { throw originalError; },
    async removeFile() { throw new Error('falha de limpeza'); },
  }, { maxFileSize: 32 });
  await assert.rejects(
    service.upload({ size: 1, filename: 'interno', originalname: 'a.txt' }, 'alice'),
    (error) => error === originalError,
  );
  assert.equal(logs.mock.callCount(), 1);
});

test('configuração usa padrão de 10 MiB e rejeita valores inválidos', () => {
  const configPath = path.resolve(__dirname, '../src/config.js');
  const env = { ...process.env };
  delete env.MAX_FILE_SIZE_MB;
  delete env.PORT;
  const defaults = spawnSync(process.execPath, ['-e', `console.log(JSON.stringify(require(${JSON.stringify(configPath)})))`], { env, encoding: 'utf8' });
  assert.equal(defaults.status, 0);
  assert.deepEqual(JSON.parse(defaults.stdout), { port: 3000, maxFileSize: 10485760 });
  for (const value of ['', '0', '-1', 'abc', 'Infinity', '1.5', '99999999999999999']) {
    const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(configPath)})`], {
      env: { ...env, MAX_FILE_SIZE_MB: value },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /MAX_FILE_SIZE_MB/);
  }
  const configured = spawnSync(process.execPath, ['-e', `console.log(JSON.stringify(require(${JSON.stringify(configPath)})))`], {
    env: { ...env, MAX_FILE_SIZE_MB: '2', PORT: '4000' },
    encoding: 'utf8',
  });
  assert.equal(configured.status, 0);
  assert.deepEqual(JSON.parse(configured.stdout), { port: 4000, maxFileSize: 2097152 });
  const invalidPort = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(configPath)})`], {
    env: { ...env, PORT: 'inválida' },
    encoding: 'utf8',
  });
  assert.notEqual(invalidPort.status, 0);
  assert.match(invalidPort.stderr, /PORT/);
});
