const express = require('express');
const { registrarSubproduto, consumirSubproduto } = require('../controllers/subproduto.controller');
const router = express.Router();

router.post('/registrar', registrarSubproduto);
router.post('/consumir', consumirSubproduto);

module.exports = router;
