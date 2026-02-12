const express = require('express');
const controller = require('../controllers/peca.controller');
const router = express.Router();

router.post('/consumir', controller.consumirPeca);
router.post('/substituir', controller.substituirPeca);
router.get('/historico', controller.historicoPecas);

module.exports = router;
