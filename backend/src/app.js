const express = require('express');
const config = require('./config');
const { createDocumentsRepository } = require('./repositories/documents.repository');
const { createDocumentsService } = require('./services/documents.service');
const { createDocumentsController } = require('./controllers/documents.controller');
const { createDocumentsRouter } = require('./routes/documents.routes');

function createApp({
  repository = createDocumentsRepository(),
  maxFileSize = config.maxFileSize,
} = {}) {
  const app = express();
  const service = createDocumentsService(repository, { maxFileSize });
  const controller = createDocumentsController(service, {
    uploadStorage: repository.uploadStorage,
    maxFileSize,
  });

  app.use(express.json());
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  app.use(createDocumentsRouter(controller));
  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const invalidJson = error.type === 'entity.parse.failed';
    const oversizedBody = error.type === 'entity.too.large';
    if (!invalidJson && !oversizedBody) {
      console.error('Falha inesperada ao processar a requisição:', error);
    }
    res.status(invalidJson ? 400 : oversizedBody ? 413 : 500).json({
      error: {
        code: invalidJson ? 'INVALID_REQUEST' : oversizedBody ? 'REQUEST_TOO_LARGE' : 'INTERNAL_ERROR',
        message: invalidJson ? 'Corpo JSON inválido.'
          : oversizedBody ? 'O corpo da requisição excede o limite permitido.'
            : 'Não foi possível processar a requisição.',
      },
    });
  });

  return app;
}

const app = createApp();

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`DMS backend ouvindo na porta ${config.port}`);
  });
}

module.exports = app;
module.exports.createApp = createApp;
