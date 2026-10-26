import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { listDocuments, uploadDocument, downloadDocument } from '../src/services/documentsApi.js';

const require = createRequire(import.meta.url);
const { createApp } = require('../../backend/src/app.js');
const { createDocumentsRepository } = require('../../backend/src/repositories/documents.repository.js');
const root = fileURLToPath(new URL('../', import.meta.url));

test('cliente integra upload, listagem e download através do proxy Vite real', async (t) => {
  const storageDirectory = await mkdtemp(path.resolve(root, '../backend/storage/frontend-test-'));
  t.after(() => rm(storageDirectory, { recursive: true, force: true }));
  const repository = createDocumentsRepository({ storageDirectory });
  const backend = createApp({ repository }).listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => {
    backend.close((error) => error ? reject(error) : resolve());
    backend.closeAllConnections();
  }));
  await new Promise((resolve, reject) => {
    backend.once('listening', resolve);
    backend.once('error', reject);
  });
  const vite = await createServer({
    root,
    configFile: false,
    optimizeDeps: { noDiscovery: true, entries: [] },
    server: {
      hmr: false,
      host: '127.0.0.1',
      port: 0,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backend.address().port}`,
          rewrite: (url) => url.replace(/^\/api/, ''),
        },
      },
    },
  });
  t.after(() => vite.close());
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const nativeFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (url, options) => nativeFetch(new URL(url, origin), options));

  assert.deepEqual(await listDocuments('alice'), []);
  const file = new File([new Uint8Array([0, 255, 128])], 'dados.bin');
  const document = await uploadDocument(file, 'alice');
  assert.equal(document.originalName, 'dados.bin');
  assert.equal(document.size, 3);
  assert.deepEqual(await listDocuments('alice'), [document]);
  assert.deepEqual(await listDocuments('bob'), []);
  assert.deepEqual(
    new Uint8Array(await (await downloadDocument(document.id, 'alice')).arrayBuffer()),
    new Uint8Array([0, 255, 128]),
  );
  await assert.rejects(downloadDocument(document.id, 'bob'), /Documento não encontrado/);
});

test('componentes renderizam a estrutura inicial acessível', async (t) => {
  const vite = await createServer({
    root,
    optimizeDeps: { noDiscovery: true, entries: [] },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const { default: App } = await vite.ssrLoadModule('/src/App.jsx');
  const { default: UploadComponent } = await vite.ssrLoadModule('/src/components/UploadComponent.jsx');
  const { default: DocumentList } = await vite.ssrLoadModule('/src/components/DocumentList.jsx');
  const { default: DownloadButton } = await vite.ssrLoadModule('/src/components/DownloadButton.jsx');
  const app = renderToStaticMarkup(createElement(App));
  assert.match(app, /Identificador do usuário/);
  assert.match(app, /não possui autenticação/);
  assert.match(app, /Informe seu identificador/);
  const upload = renderToStaticMarkup(createElement(UploadComponent, { owner: 'alice', onUploaded() {} }));
  assert.match(upload, /type="file"/);
  assert.match(upload, /disabled="">Enviar documento/);
  const list = renderToStaticMarkup(createElement(DocumentList, { owner: 'alice', refreshKey: 0 }));
  assert.match(list, /Carregando documentos/);
  assert.match(list, /aria-busy="true"/);
  const download = renderToStaticMarkup(createElement(DownloadButton, {
    owner: 'alice', document: { id: 'id', originalName: 'arquivo.bin' },
  }));
  assert.match(download, /aria-label="Baixar arquivo.bin"/);
});
