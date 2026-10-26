const { randomUUID } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const { open, unlink } = require('node:fs/promises');
const path = require('node:path');
const multer = require('multer');

function createDocumentsRepository({
  storageDirectory = path.resolve(__dirname, '../../storage'),
} = {}) {
  mkdirSync(storageDirectory, { recursive: true });
  const documents = new Map();
  const uploadStorage = multer.diskStorage({
    destination: storageDirectory,
    filename(req, file, callback) {
      callback(null, randomUUID());
    },
  });

  function filePath(storageName) {
    if (!storageName || storageName === '.' || storageName === '..' || path.basename(storageName) !== storageName) {
      throw new Error('Nome interno de armazenamento inválido.');
    }
    return path.join(storageDirectory, storageName);
  }

  return {
    uploadStorage,
    save(document) {
      documents.set(document.id, { ...document });
      return { ...document };
    },
    findById(id) {
      const document = documents.get(id);
      return document ? { ...document } : null;
    },
    findByOwner(owner) {
      return Array.from(documents.values())
        .filter((document) => document.owner === owner)
        .reverse()
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
        .map((document) => ({ ...document }));
    },
    async removeFile(storageName) {
      await unlink(filePath(storageName));
    },
    async openFile(storageName) {
      const handle = await open(filePath(storageName), 'r');
      try {
        const stat = await handle.stat();
        if (!stat.isFile()) {
          throw new Error('O documento armazenado não é um arquivo.');
        }
        return { stream: handle.createReadStream(), size: stat.size };
      } catch (error) {
        await handle.close();
        throw error;
      }
    },
  };
}

module.exports = { createDocumentsRepository };
