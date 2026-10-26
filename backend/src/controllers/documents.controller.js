const multer = require('multer');
const { DocumentError } = require('../services/documents.service');

const documentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const errorStatuses = {
  USER_ID_REQUIRED: 400,
  FILE_REQUIRED: 400,
  INVALID_UPLOAD: 400,
  INVALID_DOCUMENT_ID: 400,
  FILE_TOO_LARGE: 413,
  DOCUMENT_NOT_FOUND: 404,
};
const failureMessages = {
  UPLOAD_FAILED: 'Não foi possível enviar o documento.',
  DOCUMENT_LIST_FAILED: 'Não foi possível listar os documentos.',
  DOWNLOAD_FAILED: 'Não foi possível baixar o documento.',
};

function sendError(error, res, fallbackCode) {
  const status = error instanceof DocumentError ? errorStatuses[error.code] : undefined;
  if (!status) {
    console.error(failureMessages[fallbackCode], error);
  }
  if (res.headersSent || res.destroyed) {
    res.destroy();
    return;
  }
  res.removeHeader('Content-Disposition');
  res.removeHeader('Content-Length');
  res.status(status || 500).type('application/json').json({
    error: {
      code: status ? error.code : fallbackCode,
      message: status ? error.message : failureMessages[fallbackCode],
    },
  });
}

function createDocumentsController(service, { uploadStorage, maxFileSize }) {
  const receiveFile = multer({
    storage: uploadStorage,
    // O multer sinaliza o limite ao atingi-lo; o service aceita exatamente o máximo.
    limits: { fileSize: maxFileSize + 1, files: 1 },
  }).single('file');

  return {
    requireOwner(req, res, next) {
      const owner = req.get('X-User-Id')?.trim();
      if (!owner) {
        sendError(
          new DocumentError('USER_ID_REQUIRED', 'Informe o identificador do usuário em X-User-Id.'),
          res,
          'UPLOAD_FAILED',
        );
        return;
      }
      req.documentOwner = owner;
      next();
    },
    upload(req, res) {
      receiveFile(req, res, async (error) => {
        if (error) {
          if (error.storageErrors?.length) {
            console.error('Falha ao limpar arquivos de uma requisição de upload inválida:', error.storageErrors);
          }
          if (error instanceof multer.MulterError) {
            error = error.code === 'LIMIT_FILE_SIZE'
              ? new DocumentError('FILE_TOO_LARGE', 'O arquivo excede o limite permitido.')
              : new DocumentError('INVALID_UPLOAD', 'Envie somente um arquivo no campo file.');
          } else if (/^(Multipart:|Unexpected end of (form|file)|Malformed part header)/.test(error.message)) {
            error = new DocumentError('INVALID_UPLOAD', 'Requisição multipart inválida.');
          }
          sendError(error, res, 'UPLOAD_FAILED');
          return;
        }
        try {
          const document = await service.upload(req.file, req.documentOwner);
          res.status(201).json({ document });
        } catch (uploadError) {
          sendError(uploadError, res, 'UPLOAD_FAILED');
        }
      });
    },
    async list(req, res) {
      try {
        const documents = await service.list(req.documentOwner);
        res.json({ documents });
      } catch (error) {
        sendError(error, res, 'DOCUMENT_LIST_FAILED');
      }
    },
    async download(req, res) {
      if (!documentIdPattern.test(req.params.id)) {
        sendError(
          new DocumentError('INVALID_DOCUMENT_ID', 'Identificador do documento inválido.'),
          res,
          'DOWNLOAD_FAILED',
        );
        return;
      }
      try {
        const { stream, size, originalName } = await service.download(req.params.id, req.documentOwner);
        res.attachment(originalName);
        res.type('application/octet-stream');
        res.set('Content-Length', String(size));
        stream.once('error', (error) => sendError(error, res, 'DOWNLOAD_FAILED'));
        res.once('close', () => stream.destroy());
        stream.pipe(res);
      } catch (error) {
        sendError(error, res, 'DOWNLOAD_FAILED');
      }
    },
  };
}

module.exports = { createDocumentsController };
