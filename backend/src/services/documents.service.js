const { randomUUID } = require('node:crypto');

class DocumentError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function toPublicMetadata({ id, originalName, size, uploadedAt, owner }) {
  return { id, originalName, size, uploadedAt, owner };
}

async function removeFailedUpload(repository, filename) {
  try {
    await repository.removeFile(filename);
  } catch (cleanupError) {
    console.error('Falha ao remover arquivo de upload não concluído:', cleanupError);
  }
}

async function findOwnedDocument(repository, id, owner) {
  const document = await repository.findById(id);
  if (!document || document.owner !== owner) {
    throw new DocumentError('DOCUMENT_NOT_FOUND', 'Documento não encontrado.');
  }
  return document;
}

function createDocumentsService(repository, { maxFileSize }) {
  return {
    async upload(file, owner) {
      if (!file) {
        throw new DocumentError('FILE_REQUIRED', 'Envie um arquivo no campo file.');
      }
      try {
        if (file.size > maxFileSize) {
          throw new DocumentError('FILE_TOO_LARGE', 'O arquivo excede o limite permitido.');
        }
        const document = await repository.save({
          id: randomUUID(),
          originalName: file.originalname,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          owner,
          storageName: file.filename,
        });
        return toPublicMetadata(document);
      } catch (error) {
        await removeFailedUpload(repository, file.filename);
        throw error;
      }
    },
    async list(owner) {
      const documents = await repository.findByOwner(owner);
      return documents.map(toPublicMetadata);
    },
    async download(id, owner) {
      const document = await findOwnedDocument(repository, id, owner);
      const file = await repository.openFile(document.storageName);
      return { ...file, originalName: document.originalName };
    },
  };
}

module.exports = { createDocumentsService, DocumentError };
