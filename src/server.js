require('dotenv').config();

const express = require('express');
const rotas = require('./rotas');
const { verificarConexao } = require('./db');

const app = express();
const porta = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(rotas);

// Endpoint inexistente também devolve JSON, mantendo o padrão da API.
app.use((req, res) => {
  res.status(404).json({
    sucesso: false,
    erro: { codigo: 'ROTA_NAO_ENCONTRADA', mensagem: `Rota ${req.method} ${req.path} não encontrada.` }
  });
});

// Middleware centralizado para falhas do Express e de JSON malformado.
app.use((erro, _req, res, _next) => {
  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({
      sucesso: false,
      erro: { codigo: 'JSON_INVALIDO', mensagem: 'O corpo da requisição não contém um JSON válido.' }
    });
  }

  const status = Number.isInteger(erro.status) && erro.status >= 400 && erro.status < 600 ? erro.status : 500;
  const codigo = erro.codigo || (status === 500 ? 'ERRO_INTERNO' : 'REQUISICAO_INVALIDA');
  const mensagem = status === 500
    ? (erro.codigo === 'ERRO_BANCO' ? erro.message : 'Ocorreu um erro interno no servidor.')
    : (erro.message || 'Não foi possível processar a requisição.');

  if (status === 500 && erro.codigo !== 'ERRO_BANCO') {
    console.error('[erro-servidor]', erro.code || erro.message);
  }

  return res.status(status).json({ sucesso: false, erro: { codigo, mensagem } });
});

async function iniciarServidor() {
  try {
    await verificarConexao();
    console.log('MySQL conectado com sucesso.');
  } catch (erro) {
    console.error('MySQL indisponível:', erro.code || erro.message);
    console.error('A API será iniciada mesmo assim; as rotas que usam o banco retornarão erro até a conexão ser corrigida.');
  }

  app.listen(porta, () => {
    console.log('');
    console.log('╭────────────────────────────────────────────╮');
    console.log('│              VENDAS360                     │');
    console.log('│      Gestão de vendas e comissões           │');
    console.log('╰────────────────────────────────────────────╯');
    console.log(`API:    http://localhost:${porta}`);
    console.log(`Status: http://localhost:${porta}/health`);
    console.log(`Rotas:  http://localhost:${porta}/`);
  });
}

iniciarServidor();
