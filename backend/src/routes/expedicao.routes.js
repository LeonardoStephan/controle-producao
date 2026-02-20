const express = require('express');
const controller = require('../controllers/expedicao.controller');
const router = express.Router();

router.post('/iniciar', controller.iniciarExpedicao);
router.post('/:id/eventos', controller.adicionarEventoExpedicao);
router.post('/:id/scan-serie', controller.scanSerie);
router.post('/serie/:id/foto', controller.uploadFotoSerie);
router.post('/:id/finalizar', controller.finalizarExpedicao);
router.get('/:empresa/:numeroPedido/resumo', controller.resumoExpedicao);

module.exports = router;
