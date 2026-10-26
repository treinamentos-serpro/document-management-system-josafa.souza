const { Router } = require('express');

function createDocumentsRouter(controller) {
  const router = Router();
  router.post('/upload', controller.requireOwner, controller.upload);
  router.get('/documents', controller.requireOwner, controller.list);
  router.get('/documents/:id/download', controller.requireOwner, controller.download);
  return router;
}

module.exports = { createDocumentsRouter };
