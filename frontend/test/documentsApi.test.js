import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listDocuments, uploadDocument, downloadDocument } from '../src/services/documentsApi.js';

const document = {
  id: 'document-id',
  originalName: 'documento.txt',
  size: 3,
  uploadedAt: '2026-10-26T19:08:38.526Z',
  owner: 'alice',
};

test('lista usa prefixo /api, cabeçalho normalizado e sinal de cancelamento', async (t) => {
  const signal = new AbortController().signal;
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/documents');
    assert.deepEqual(options.headers, { 'X-User-Id': 'alice' });
    assert.equal(options.signal, signal);
    return Response.json({ documents: [document] });
  });
  assert.deepEqual(await listDocuments(' alice ', { signal }), [document]);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('upload envia FormData sem fixar Content-Type', async (t) => {
  const file = new File(['abc'], 'documento.txt');
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/upload');
    assert.equal(options.method, 'POST');
    assert.deepEqual(options.headers, { 'X-User-Id': 'alice' });
    const uploaded = options.body.get('file');
    assert.equal(uploaded.name, file.name);
    assert.equal(await uploaded.text(), 'abc');
    return Response.json({ document }, { status: 201 });
  });
  assert.deepEqual(await uploadDocument(file, 'alice'), document);
});

test('download codifica identificador e preserva bytes', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, '/api/documents/a%2Fb/download');
    return new Response(new Uint8Array([0, 255, 128]));
  });
  const blob = await downloadDocument('a/b', 'alice');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), new Uint8Array([0, 255, 128]));
});

test('entrada inválida não dispara requisição', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => assert.fail('Não deveria chamar fetch.'));
  await assert.rejects(listDocuments('   '), /Informe o identificador/);
  await assert.rejects(uploadDocument(null, 'alice'), /Selecione um arquivo/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('propaga mensagem de erro HTTP para todas as operações', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    error: { code: 'FILE_TOO_LARGE', message: 'O arquivo excede o limite permitido.' },
  }, { status: 413 }));
  for (const operation of [
    () => listDocuments('alice'),
    () => uploadDocument(new File(['x'], 'x.txt'), 'alice'),
    () => downloadDocument('id', 'alice'),
  ]) {
    await assert.rejects(operation(), /O arquivo excede o limite permitido/);
  }
});

test('erros HTTP sem JSON válido são explícitos', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('proxy indisponível', { status: 502 }));
  await assert.rejects(listDocuments('alice'), /erro \(502\) sem detalhes válidos/);
});

test('erros de rede são comunicados em português e cancelamento é preservado', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(listDocuments('alice'), /Não foi possível conectar/);
  const abortError = new DOMException('Cancelado', 'AbortError');
  fetchMock.mock.mockImplementation(async () => { throw abortError; });
  await assert.rejects(listDocuments('alice'), (error) => error === abortError);
});

test('respostas JSON inválidas não são tratadas como sucesso', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('não é JSON'));
  await assert.rejects(listDocuments('alice'), /resposta inválida/);
  for (const body of [null, {}, { documents: {} }, { documents: [null] }, { documents: [{ id: 'x' }] }]) {
    fetchMock.mock.mockImplementation(async () => Response.json(body));
    await assert.rejects(listDocuments('alice'), /lista de documentos inválida/);
  }
  fetchMock.mock.mockImplementation(async () => Response.json({ document: { id: 'x' } }));
  await assert.rejects(uploadDocument(new File(['x'], 'x.txt'), 'alice'), /dados do documento inválidos/);
});

test('falha na leitura do download é comunicada', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    async blob() { throw new Error('transferência interrompida'); },
  }));
  await assert.rejects(downloadDocument('id', 'alice'), /concluir a transferência/);
});
