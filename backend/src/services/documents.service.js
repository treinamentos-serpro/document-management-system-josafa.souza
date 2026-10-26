const { randomUUID } = require('node:crypto');

class DocumentError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function publicMetadata({ id, originalName, size, uploadedAt, owner }) {
  return { id, originalName, size, uploadedAt, owner };
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
        return publicMetadata(document);
      } catch (error) {
        try {
          await repository.removeFile(file.filename);
        } catch (cleanupError) {
          console.error('Falha ao remover arquivo de upload não concluído:', cleanupError);
        }
        throw error;
      }
    },
    async list(owner) {
      const documents = await repository.findByOwner(owner);
      return documents.map(publicMetadata);
    },
    async download(id, owner) {
      const document = await repository.findById(id);
      if (!document || document.owner !== owner) {
        throw new DocumentError('DOCUMENT_NOT_FOUND', 'Documento não encontrado.');
      }
      const file = await repository.openFile(document.storageName);
      return { ...file, originalName: document.originalName };
    },
  };
}

module.exports = { createDocumentsService, DocumentError };
