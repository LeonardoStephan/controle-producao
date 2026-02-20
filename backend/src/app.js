const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ROTAS PRODUCAO
app.use('/op', require('./routes/op.routes'));
app.use('/pecas', require('./routes/peca.routes'));
app.use('/subproduto', require('./routes/subproduto.routes'));
app.use('/produto-final', require('./routes/produtoFinal.routes'));
app.use('/health', require('./routes/health.routes'));

// ROTAS EXPEDICAO
app.use('/expedicao', require('./routes/expedicao.routes'));
app.use('/expedicao/fotos-gerais', require('./routes/fotoExpedicaoGeral.routes'));

// ROTAS MANUTENCAO
app.use('/manutencao', require('./routes/manutencao.routes'));
app.use('/series', require('./routes/serie.routes'));
app.use('/admin', require('./routes/adminFuncionario.routes'));

module.exports = app;
