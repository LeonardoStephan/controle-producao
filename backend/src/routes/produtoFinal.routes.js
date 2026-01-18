const express = require('express');
const controller = require('../controllers/produtoFinal.controller');

const router = express.Router();

router.post('/criar', controller.criarProdutoFinal);

module.exports = router;
