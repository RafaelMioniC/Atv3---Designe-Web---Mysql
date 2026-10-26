const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularComissao, gerarRelatorioPerformance } = require('../src/funcoes');

test('calcula R$ 180,00 no caso de referência (PJ, Norte, base 5%)', () => {
  assert.equal(calcularComissao('2000.00', '5.00', 'PJ', '1.00'), '180.00');
});

test('soma corretamente bônus PF e Sul', () => {
  // 5% de base + 2% PF + 0,5% Sul = 7,5% de R$ 100,00.
  assert.equal(calcularComissao('100.00', '5.00', 'PF', '0.50'), '7.50');
});

test('arredonda meio centavo para cima', () => {
  // R$ 0,25 × 2% = R$ 0,005; arredondamento monetário para duas casas = R$ 0,01.
  assert.equal(calcularComissao('0.25', '0.00', 'PF', '0.00'), '0.01');
});

test('rejeita tipo de cliente inválido', () => {
  assert.throws(
    () => calcularComissao('100.00', '5.00', 'OUTRO', '1.00'),
    (erro) => erro.status === 400 && erro.codigo === 'VALIDACAO'
  );
});

test('rejeita valor de venda negativo', () => {
  assert.throws(
    () => calcularComissao('-10.00', '5.00', 'PJ', '1.00'),
    (erro) => erro.status === 400 && erro.codigo === 'VALIDACAO'
  );
});

test('rejeita data inválida no relatório antes de consultar o banco', async () => {
  await assert.rejects(
    () => gerarRelatorioPerformance('2026-13-01', '2026-10-31'),
    (erro) => erro.status === 400 && erro.codigo === 'VALIDACAO'
  );
});

test('rejeita intervalo de relatório invertido', async () => {
  await assert.rejects(
    () => gerarRelatorioPerformance('2026-11-01', '2026-10-31'),
    (erro) => erro.status === 400 && erro.codigo === 'VALIDACAO'
  );
});
