const express = require('express');
const funcoes = require('./funcoes');

const router = express.Router();

// Identidade e documentação resumida da API para facilitar a exploração no navegador.
router.get('/', (_req, res) => {
  return res.status(200).json({
    sucesso: true,
    aplicacao: 'Vendas360',
    descricao: 'Gestão de vendas, comissões, metas e performance.',
    versao: '1.1.0',
    status: 'online',
    endpoints: {
      saude: 'GET /health',
      vendedores: 'GET /vendedores',
      vendas: 'GET /vendas',
      relatorio: 'GET /relatorios/performance?inicio=AAAA-MM-DD&fim=AAAA-MM-DD'
    }
  });
});

router.get('/health', async (_req, res) => {
  try {
    await require('./db').verificarConexao();
    return res.status(200).json({
      sucesso: true,
      aplicacao: 'Vendas360',
      status: 'ok',
      servicos: { api: 'online', mysql: 'conectado' }
    });
  } catch (_erro) {
    return res.status(503).json({
      sucesso: false,
      aplicacao: 'Vendas360',
      status: 'degradado',
      servicos: { api: 'online', mysql: 'indisponivel' },
      mensagem: 'A API está ativa, mas não conseguiu conectar ao banco de dados.'
    });
  }
});

function sucesso(res, status, mensagem, dados) {
  return res.status(status).json({ sucesso: true, mensagem, dados });
}

router.post('/vendedores', async (req, res) => {
  const vendedor = await funcoes.cadastrarVendedor(req.body || {});
  return sucesso(res, 201, 'Vendedor cadastrado com sucesso.', vendedor);
});

router.get('/vendedores', async (_req, res) => {
  const vendedores = await funcoes.listarVendedores();
  return sucesso(res, 200, 'Vendedores consultados com sucesso.', vendedores);
});

router.get('/vendedores/:id', async (req, res) => {
  const vendedor = await funcoes.consultarVendedorPorId(req.params.id);
  return sucesso(res, 200, 'Vendedor consultado com sucesso.', vendedor);
});

router.put('/vendedores/:id', async (req, res) => {
  const vendedor = await funcoes.atualizarVendedor(req.params.id, req.body || {});
  return sucesso(res, 200, 'Vendedor atualizado com sucesso.', vendedor);
});

router.patch('/vendedores/:id/desativar', async (req, res) => {
  const vendedor = await funcoes.desativarVendedor(req.params.id);
  return sucesso(res, 200, 'Vendedor desativado com sucesso. O histórico foi preservado.', vendedor);
});

router.post('/vendas', async (req, res) => {
  const venda = await funcoes.registrarVenda(req.body || {});
  return sucesso(res, 201, 'Venda registrada com sucesso.', venda);
});

router.get('/vendas', async (_req, res) => {
  const vendas = await funcoes.listarVendas();
  return sucesso(res, 200, 'Vendas consultadas com sucesso.', vendas);
});

router.get('/vendas/vendedor/:id', async (req, res) => {
  const vendas = await funcoes.consultarVendasPorVendedor(req.params.id);
  return sucesso(res, 200, 'Vendas do vendedor consultadas com sucesso.', vendas);
});

router.get('/vendas/regiao/:id', async (req, res) => {
  const vendas = await funcoes.consultarVendasPorRegiao(req.params.id);
  return sucesso(res, 200, 'Vendas da região consultadas com sucesso.', vendas);
});

router.delete('/vendas/:id', async (req, res) => {
  const resultado = await funcoes.excluirVenda(req.params.id);
  return sucesso(res, 200, 'Venda excluída com sucesso.', resultado);
});

router.get('/relatorios/performance', async (req, res) => {
  const relatorio = await funcoes.gerarRelatorioPerformance(req.query.inicio, req.query.fim);
  return sucesso(res, 200, 'Relatório de performance gerado com sucesso.', relatorio);
});

module.exports = router;
