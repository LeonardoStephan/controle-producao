const express = require('express');
const controller = require('../controllers/manutencao.controller');
const router = express.Router();

router.post('/abrir', controller.abrirManutencao);
router.post('/:id/avancar', controller.avancarEtapaManutencao);
router.post('/:id/pecas', controller.registrarPecaTrocada);
router.post('/:id/finalizar', controller.finalizarManutencao);
router.get('/:id/resumo', controller.resumoManutencao);
router.get('/serie/:serie/historico', controller.historicoPorSerie);

module.exports = router;
