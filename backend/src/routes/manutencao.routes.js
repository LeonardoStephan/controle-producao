const express = require('express');
const controller = require('../controllers/manutencao.controller');
const router = express.Router();

router.post('/abrir', controller.abrirManutencao);
router.post('/:id/scan-serie', controller.scanSerieManutencao);
router.post('/:id/avancar', controller.avancarEtapaManutencao);
router.post('/:id/pecas', controller.registrarPecaTrocada);
router.post('/:id/finalizar', controller.finalizarManutencao);
router.get('/:empresa/:numeroOS/resumo', controller.resumoManutencao);

module.exports = router;
