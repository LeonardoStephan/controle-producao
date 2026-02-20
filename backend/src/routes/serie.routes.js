const express = require('express');
const controller = require('../controllers/serie.controller');

const router = express.Router();

router.get('/:serie/timeline', controller.timelineSerie);

module.exports = router;

