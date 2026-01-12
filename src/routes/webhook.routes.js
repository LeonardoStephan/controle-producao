const express = require('express');
const router = express.Router();

const controller = require('../controllers/omie.controller');

router.post('/omie', controller.receberEventoOmie);

module.exports = router;
