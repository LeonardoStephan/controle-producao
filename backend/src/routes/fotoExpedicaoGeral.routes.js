const express = require('express');
const controller = require('../controllers/fotoExpedicaoGeral.controller');
const router = express.Router();

router.post('/upload', controller.uploadFotoGeral);
router.get('/:expedicaoId', controller.listarFotosGerais);

module.exports = router;
