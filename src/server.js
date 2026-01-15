const express = require('express');
const app = express();

app.use(express.json());

app.use('/op', require('./routes/op.routes'));
app.use('/subproduto', require('./routes/subproduto.routes'));
app.use('/produto-final', require('./routes/produtoFinal.routes'));

app.listen(3333, () => {
  console.log('Servidor rodando na porta 3333');
});
