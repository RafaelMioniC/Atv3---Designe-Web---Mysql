const { pool } = require('./db');

class ErroAplicacao extends Error {
  constructor(status, codigo, mensagem) {
    super(mensagem);
    this.name = 'ErroAplicacao';
    this.status = status;
    this.codigo = codigo;
  }
}

function falhaValidacao(mensagem) {
  throw new ErroAplicacao(400, 'VALIDACAO', mensagem);
}

function traduzirErroBanco(operacao, erro) {
  if (erro instanceof ErroAplicacao) return erro;

  // O detalhe técnico fica apenas no terminal do servidor, nunca na resposta HTTP.
  console.error(`[${operacao}]`, erro.code || erro.message);

  if (erro.code === 'ER_DUP_ENTRY') {
    return new ErroAplicacao(409, 'CONFLITO', 'O código informado já existe.');
  }

  if (erro.code === 'ER_NO_REFERENCED_ROW_2' || erro.code === 'ER_ROW_IS_REFERENCED_2') {
    return new ErroAplicacao(400, 'INTEGRIDADE', 'A operação viola um relacionamento do banco de dados.');
  }

  return new ErroAplicacao(
    500,
    'ERRO_BANCO',
    'Não foi possível concluir a operação. Verifique se o banco de dados está disponível.'
  );
}

function validarId(valor, campo = 'id') {
  const texto = String(valor ?? '').trim();
  if (!/^\d+$/.test(texto)) falhaValidacao(`${campo} deve ser um número inteiro positivo.`);
  const id = Number(texto);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
    falhaValidacao(`${campo} deve estar entre 1 e 2147483647.`);
  }
  return id;
}

function decimalParaEscala(valor, casas, campo) {
  const texto = String(valor ?? '').trim();
  const regex = casas === 2 ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/;
  if (!regex.test(texto)) falhaValidacao(`${campo} deve ser um número decimal válido com até duas casas decimais.`);

  const partes = texto.split('.');
  const inteira = partes[0];
  const fracao = (partes[1] || '').padEnd(casas, '0').slice(0, casas);
  return BigInt(inteira) * (10n ** BigInt(casas)) + BigInt(fracao || '0');
}

function formatarEscala(inteiro, casas = 2) {
  const fator = 10n ** BigInt(casas);
  const unidade = inteiro / fator;
  const fracao = (inteiro % fator).toString().padStart(casas, '0');
  return `${unidade}.${fracao}`;
}

function normalizarDecimal(valor, campo, opcoes = {}) {
  const { casasInteirasMax = 10, permitirZero = true } = opcoes;
  const texto = String(valor ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) {
    falhaValidacao(`${campo} é obrigatório e deve ser um número com até duas casas decimais.`);
  }
  const quantidadeInteira = texto.split('.')[0].length;
  if (quantidadeInteira > casasInteirasMax) {
    falhaValidacao(`${campo} ultrapassa o limite permitido.`);
  }
  const escalado = decimalParaEscala(texto, 2, campo);
  if (!permitirZero && escalado <= 0n) falhaValidacao(`${campo} deve ser maior que zero.`);
  return formatarEscala(escalado);
}

function normalizarDataHora(valor) {
  const texto = String(valor ?? '').trim();
  const correspondencia = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(texto);
  if (!correspondencia) {
    falhaValidacao('data_venda deve usar o formato ISO YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss, sem fuso horário.');
  }

  const data = correspondencia[1];
  const objetoData = new Date(`${data}T00:00:00.000Z`);
  if (Number(data.slice(0, 4)) < 1000 || Number.isNaN(objetoData.getTime()) || objetoData.toISOString().slice(0, 10) !== data) {
    falhaValidacao('data_venda contém uma data inexistente.');
  }

  const hora = correspondencia[2] ?? '00';
  const minuto = correspondencia[3] ?? '00';
  const segundo = correspondencia[4] ?? '00';
  if (Number(hora) > 23 || Number(minuto) > 59 || Number(segundo) > 59) {
    falhaValidacao('data_venda contém um horário inválido.');
  }
  return `${data} ${hora}:${minuto}:${segundo}`;
}

function validarDataRelatorio(valor, campo) {
  const texto = String(valor ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    falhaValidacao(`${campo} é obrigatório e deve usar o formato YYYY-MM-DD.`);
  }
  const objetoData = new Date(`${texto}T00:00:00.000Z`);
  if (Number(texto.slice(0, 4)) < 1000 || Number.isNaN(objetoData.getTime()) || objetoData.toISOString().slice(0, 10) !== texto) {
    falhaValidacao(`${campo} não é uma data válida.`);
  }
  return texto;
}

function incrementarData(data) {
  const proximoDia = new Date(`${data}T00:00:00.000Z`);
  proximoDia.setUTCDate(proximoDia.getUTCDate() + 1);
  return proximoDia.toISOString().slice(0, 10);
}

function calcularComissao(valorVenda, percentualBase, tipoCliente, percentualRegiao) {
  if (!['PF', 'PJ'].includes(tipoCliente)) {
    falhaValidacao('tipo_cliente deve ser PF ou PJ.');
  }

  const valorCentavos = decimalParaEscala(valorVenda, 2, 'valor_venda');
  const baseCentavosPercentuais = decimalParaEscala(percentualBase, 2, 'percentual_base');
  const bonusRegiaoCentavosPercentuais = decimalParaEscala(percentualRegiao, 2, 'percentual_bonus');
  const bonusClienteCentavosPercentuais = tipoCliente === 'PF' ? 200n : 300n;

  // Os percentuais são somados como inteiros em centésimos de ponto percentual.
  // BigInt e arredondamento half-up evitam erros de ponto flutuante no valor monetário.
  const percentualTotal = baseCentavosPercentuais + bonusClienteCentavosPercentuais + bonusRegiaoCentavosPercentuais;
  const comissaoCentavos = (valorCentavos * percentualTotal + 5000n) / 10000n;
  return formatarEscala(comissaoCentavos, 2);
}

async function consultarVendedorPorId(id) {
  const idVendedor = validarId(id, 'id_vendedor');
  try {
    const [linhas] = await pool.execute(
      'SELECT id_vendedor, nome, meta_mensal, percentual_base, ativo FROM vendedores WHERE id_vendedor = ?',
      [idVendedor]
    );
    if (linhas.length === 0) throw new ErroAplicacao(404, 'NAO_ENCONTRADO', 'Vendedor não encontrado.');
    return linhas[0];
  } catch (erro) {
    throw traduzirErroBanco('consultarVendedorPorId', erro);
  }
}

async function cadastrarVendedor(dados) {
  try {
    const nome = String(dados?.nome ?? '').trim();
    if (!nome) falhaValidacao('nome é obrigatório.');
    if (nome.length > 100) falhaValidacao('nome deve ter no máximo 100 caracteres.');
    const metaMensal = normalizarDecimal(dados?.meta_mensal, 'meta_mensal', { casasInteirasMax: 10 });
    const percentualBase = normalizarDecimal(dados?.percentual_base, 'percentual_base', { casasInteirasMax: 3 });
    if (decimalParaEscala(percentualBase, 2, 'percentual_base') > 99999n) {
      falhaValidacao('percentual_base não pode ser maior que 999,99%.');
    }

    const [resultado] = await pool.execute(
      'INSERT INTO vendedores (nome, meta_mensal, percentual_base, ativo) VALUES (?, ?, ?, ?)',
      [nome, metaMensal, percentualBase, 1]
    );
    return await consultarVendedorPorId(resultado.insertId);
  } catch (erro) {
    throw traduzirErroBanco('cadastrarVendedor', erro);
  }
}

async function listarVendedores() {
  try {
    const [linhas] = await pool.execute(
      'SELECT id_vendedor, nome, meta_mensal, percentual_base, ativo FROM vendedores ORDER BY id_vendedor'
    );
    return linhas;
  } catch (erro) {
    throw traduzirErroBanco('listarVendedores', erro);
  }
}

async function atualizarVendedor(id, dados) {
  try {
    const idVendedor = validarId(id, 'id_vendedor');
    const metaMensal = normalizarDecimal(dados?.meta_mensal, 'meta_mensal', { casasInteirasMax: 10 });
    const percentualBase = normalizarDecimal(dados?.percentual_base, 'percentual_base', { casasInteirasMax: 3 });
    if (decimalParaEscala(percentualBase, 2, 'percentual_base') > 99999n) {
      falhaValidacao('percentual_base não pode ser maior que 999,99%.');
    }

    const [existe] = await pool.execute('SELECT id_vendedor FROM vendedores WHERE id_vendedor = ?', [idVendedor]);
    if (existe.length === 0) throw new ErroAplicacao(404, 'NAO_ENCONTRADO', 'Vendedor não encontrado.');

    await pool.execute(
      'UPDATE vendedores SET meta_mensal = ?, percentual_base = ? WHERE id_vendedor = ?',
      [metaMensal, percentualBase, idVendedor]
    );
    return await consultarVendedorPorId(idVendedor);
  } catch (erro) {
    throw traduzirErroBanco('atualizarVendedor', erro);
  }
}

async function desativarVendedor(id) {
  try {
    const idVendedor = validarId(id, 'id_vendedor');
    const [existe] = await pool.execute('SELECT id_vendedor FROM vendedores WHERE id_vendedor = ?', [idVendedor]);
    if (existe.length === 0) throw new ErroAplicacao(404, 'NAO_ENCONTRADO', 'Vendedor não encontrado.');

    await pool.execute('UPDATE vendedores SET ativo = 0 WHERE id_vendedor = ?', [idVendedor]);
    return await consultarVendedorPorId(idVendedor);
  } catch (erro) {
    throw traduzirErroBanco('desativarVendedor', erro);
  }
}

const SQL_VENDAS_BASE = `
  SELECT v.id_venda, v.id_vendedor, ve.nome AS nome_vendedor,
         v.id_regiao, r.nome_regiao, v.data_venda, v.valor_venda,
         v.tipo_cliente, v.valor_comissao
  FROM vendas v
  INNER JOIN vendedores ve ON ve.id_vendedor = v.id_vendedor
  INNER JOIN regioes r ON r.id_regiao = v.id_regiao
`;

async function registrarVenda(dados) {
  try {
    const idVenda = validarId(dados?.id_venda, 'id_venda');
    const idVendedor = validarId(dados?.id_vendedor, 'id_vendedor');
    const idRegiao = validarId(dados?.id_regiao, 'id_regiao');
    const dataVenda = normalizarDataHora(dados?.data_venda);
    const valorVenda = normalizarDecimal(dados?.valor_venda, 'valor_venda', { casasInteirasMax: 10, permitirZero: false });
    const tipoCliente = String(dados?.tipo_cliente ?? '').trim().toUpperCase();
    if (!['PF', 'PJ'].includes(tipoCliente)) falhaValidacao('tipo_cliente deve ser PF ou PJ.');

    const [vendaDuplicada] = await pool.execute('SELECT id_venda FROM vendas WHERE id_venda = ?', [idVenda]);
    if (vendaDuplicada.length > 0) {
      throw new ErroAplicacao(409, 'VENDA_DUPLICADA', 'Já existe uma venda com esse id_venda.');
    }

    const [vendedores] = await pool.execute(
      'SELECT id_vendedor, percentual_base, ativo FROM vendedores WHERE id_vendedor = ?',
      [idVendedor]
    );
    if (vendedores.length === 0) throw new ErroAplicacao(404, 'VENDEDOR_NAO_ENCONTRADO', 'Vendedor não encontrado.');
    if (!Boolean(Number(vendedores[0].ativo))) {
      throw new ErroAplicacao(400, 'VENDEDOR_INATIVO', 'Não é permitido registrar vendas para um vendedor inativo.');
    }

    const [regioes] = await pool.execute(
      'SELECT id_regiao, percentual_bonus FROM regioes WHERE id_regiao = ?',
      [idRegiao]
    );
    if (regioes.length === 0) throw new ErroAplicacao(404, 'REGIAO_NAO_ENCONTRADA', 'Região não encontrada.');

    const valorComissao = calcularComissao(
      valorVenda,
      vendedores[0].percentual_base,
      tipoCliente,
      regioes[0].percentual_bonus
    );

    await pool.execute(
      `INSERT INTO vendas
       (id_venda, id_vendedor, id_regiao, data_venda, valor_venda, tipo_cliente, valor_comissao)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [idVenda, idVendedor, idRegiao, dataVenda, valorVenda, tipoCliente, valorComissao]
    );

    const [linhas] = await pool.execute(`${SQL_VENDAS_BASE} WHERE v.id_venda = ?`, [idVenda]);
    return linhas[0];
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') {
      throw new ErroAplicacao(409, 'VENDA_DUPLICADA', 'Já existe uma venda com esse id_venda.');
    }
    throw traduzirErroBanco('registrarVenda', erro);
  }
}

async function listarVendas() {
  try {
    const [linhas] = await pool.execute(`${SQL_VENDAS_BASE} ORDER BY v.data_venda DESC, v.id_venda DESC`);
    return linhas;
  } catch (erro) {
    throw traduzirErroBanco('listarVendas', erro);
  }
}

async function consultarVendasPorVendedor(id) {
  try {
    const idVendedor = validarId(id, 'id_vendedor');
    const [vendedores] = await pool.execute('SELECT id_vendedor FROM vendedores WHERE id_vendedor = ?', [idVendedor]);
    if (vendedores.length === 0) throw new ErroAplicacao(404, 'VENDEDOR_NAO_ENCONTRADO', 'Vendedor não encontrado.');

    const [linhas] = await pool.execute(
      `${SQL_VENDAS_BASE} WHERE v.id_vendedor = ? ORDER BY v.data_venda DESC, v.id_venda DESC`,
      [idVendedor]
    );
    return linhas;
  } catch (erro) {
    throw traduzirErroBanco('consultarVendasPorVendedor', erro);
  }
}

async function consultarVendasPorRegiao(id) {
  try {
    const idRegiao = validarId(id, 'id_regiao');
    const [regioes] = await pool.execute('SELECT id_regiao FROM regioes WHERE id_regiao = ?', [idRegiao]);
    if (regioes.length === 0) throw new ErroAplicacao(404, 'REGIAO_NAO_ENCONTRADA', 'Região não encontrada.');

    const [linhas] = await pool.execute(
      `${SQL_VENDAS_BASE} WHERE v.id_regiao = ? ORDER BY v.data_venda DESC, v.id_venda DESC`,
      [idRegiao]
    );
    return linhas;
  } catch (erro) {
    throw traduzirErroBanco('consultarVendasPorRegiao', erro);
  }
}

async function excluirVenda(id) {
  try {
    const idVenda = validarId(id, 'id_venda');
    const [existe] = await pool.execute('SELECT id_venda FROM vendas WHERE id_venda = ?', [idVenda]);
    if (existe.length === 0) throw new ErroAplicacao(404, 'VENDA_NAO_ENCONTRADA', 'Venda não encontrada.');

    await pool.execute('DELETE FROM vendas WHERE id_venda = ?', [idVenda]);
    return { id_venda: idVenda };
  } catch (erro) {
    throw traduzirErroBanco('excluirVenda', erro);
  }
}

async function gerarRelatorioPerformance(inicioRecebido, fimRecebido) {
  try {
    const inicio = validarDataRelatorio(inicioRecebido, 'inicio');
    const fim = validarDataRelatorio(fimRecebido, 'fim');
    if (inicio > fim) falhaValidacao('inicio não pode ser posterior a fim.');
    const fimExclusivo = incrementarData(fim);

    const [totalRows] = await pool.execute(
      'SELECT COUNT(*) AS total_vendas FROM vendas WHERE data_venda >= ? AND data_venda < ?',
      [inicio, fimExclusivo]
    );

    const [vendasPorRegiao] = await pool.execute(
      `SELECT r.id_regiao, r.nome_regiao, COALESCE(SUM(v.valor_venda), 0) AS total_vendido
       FROM regioes r
       LEFT JOIN vendas v ON v.id_regiao = r.id_regiao AND v.data_venda >= ? AND v.data_venda < ?
       GROUP BY r.id_regiao, r.nome_regiao
       ORDER BY r.id_regiao`,
      [inicio, fimExclusivo]
    );

    const [vendasPorTipoCliente] = await pool.execute(
      `SELECT tipos.tipo_cliente, COALESCE(SUM(v.valor_venda), 0) AS total_vendido
       FROM (SELECT 'PF' AS tipo_cliente UNION ALL SELECT 'PJ') AS tipos
       LEFT JOIN vendas v ON v.tipo_cliente = tipos.tipo_cliente AND v.data_venda >= ? AND v.data_venda < ?
       GROUP BY tipos.tipo_cliente
       ORDER BY tipos.tipo_cliente`,
      [inicio, fimExclusivo]
    );

    const [melhorVendedorRows] = await pool.execute(
      `SELECT ve.id_vendedor, ve.nome, SUM(v.valor_venda) AS total_vendido
       FROM vendedores ve
       INNER JOIN vendas v ON v.id_vendedor = ve.id_vendedor
       WHERE v.data_venda >= ? AND v.data_venda < ?
       GROUP BY ve.id_vendedor, ve.nome
       ORDER BY total_vendido DESC, ve.id_vendedor ASC
       LIMIT 1`,
      [inicio, fimExclusivo]
    );

    const [maiorComissaoRows] = await pool.execute(
      `SELECT ve.id_vendedor, ve.nome, SUM(v.valor_comissao) AS total_comissao
       FROM vendedores ve
       INNER JOIN vendas v ON v.id_vendedor = ve.id_vendedor
       WHERE v.data_venda >= ? AND v.data_venda < ?
       GROUP BY ve.id_vendedor, ve.nome
       ORDER BY total_comissao DESC, ve.id_vendedor ASC
       LIMIT 1`,
      [inicio, fimExclusivo]
    );

    // A meta considera o mês calendário completo que contém a data inicial do relatório.
    const mesReferencia = `${inicio.slice(0, 7)}-01`;
    // Calcula o primeiro dia do mês seguinte em UTC, inclusive na virada do ano.
    const inicioMesDate = new Date(`${mesReferencia}T00:00:00.000Z`);
    inicioMesDate.setUTCMonth(inicioMesDate.getUTCMonth() + 1);
    const inicioMesSeguinte = inicioMesDate.toISOString().slice(0, 10);

    const [metasPorVendedor] = await pool.execute(
      `SELECT ve.id_vendedor, ve.nome, ve.meta_mensal,
              COALESCE(SUM(v.valor_venda), 0) AS total_vendido,
              CASE WHEN COALESCE(SUM(v.valor_venda), 0) >= ve.meta_mensal THEN 1 ELSE 0 END AS atingiu_meta
       FROM vendedores ve
       LEFT JOIN vendas v ON v.id_vendedor = ve.id_vendedor AND v.data_venda >= ? AND v.data_venda < ?
       GROUP BY ve.id_vendedor, ve.nome, ve.meta_mensal
       ORDER BY ve.id_vendedor`,
      [mesReferencia, inicioMesSeguinte]
    );

    const [metasAtingidasRows] = await pool.execute(
      `SELECT COUNT(*) AS quantidade_atingiram_meta
       FROM (
         SELECT ve.id_vendedor,
                CASE WHEN COALESCE(SUM(v.valor_venda), 0) >= ve.meta_mensal THEN 1 ELSE 0 END AS atingiu_meta
         FROM vendedores ve
         LEFT JOIN vendas v ON v.id_vendedor = ve.id_vendedor AND v.data_venda >= ? AND v.data_venda < ?
         GROUP BY ve.id_vendedor, ve.meta_mensal
       ) AS apuracao
       WHERE apuracao.atingiu_meta = 1`,
      [mesReferencia, inicioMesSeguinte]
    );

    const [mediaGeralRows] = await pool.execute(
      'SELECT AVG(valor_comissao) AS comissao_media_geral FROM vendas WHERE data_venda >= ? AND data_venda < ?',
      [inicio, fimExclusivo]
    );

    const [mediaPorRegiao] = await pool.execute(
      `SELECT r.id_regiao, r.nome_regiao, AVG(v.valor_comissao) AS comissao_media
       FROM regioes r
       LEFT JOIN vendas v ON v.id_regiao = r.id_regiao AND v.data_venda >= ? AND v.data_venda < ?
       GROUP BY r.id_regiao, r.nome_regiao
       ORDER BY r.id_regiao`,
      [inicio, fimExclusivo]
    );

    return {
      periodo: { inicio, fim, data_final_inclusiva: true },
      total_vendas: Number(totalRows[0].total_vendas),
      vendas_por_regiao: vendasPorRegiao,
      vendas_por_tipo_cliente: vendasPorTipoCliente,
      melhor_vendedor: melhorVendedorRows[0] || null,
      maior_comissao: maiorComissaoRows[0] || null,
      metas_mensais: {
        mes_referencia: inicio.slice(0, 7),
        quantidade_atingiram_meta: Number(metasAtingidasRows[0].quantidade_atingiram_meta),
        vendedores: metasPorVendedor.map((vendedor) => ({
          ...vendedor,
          atingiu_meta: Number(vendedor.atingiu_meta) === 1
        }))
      },
      comissao_media_geral: mediaGeralRows[0].comissao_media_geral,
      comissao_media_por_regiao: mediaPorRegiao
    };
  } catch (erro) {
    throw traduzirErroBanco('gerarRelatorioPerformance', erro);
  }
}

module.exports = {
  ErroAplicacao,
  calcularComissao,
  cadastrarVendedor,
  listarVendedores,
  consultarVendedorPorId,
  atualizarVendedor,
  desativarVendedor,
  registrarVenda,
  listarVendas,
  consultarVendasPorVendedor,
  consultarVendasPorRegiao,
  excluirVenda,
  gerarRelatorioPerformance
};
