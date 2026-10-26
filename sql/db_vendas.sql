-- Sistema de Vendas com Comissões, Metas e Performance
-- Script não contém DROP DATABASE, DROP TABLE ou DELETE global.
-- Execute em ambiente de desenvolvimento e confira os IDs antes de reutilizar em uma base existente.

CREATE DATABASE IF NOT EXISTS db_vendas
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE db_vendas;

CREATE TABLE IF NOT EXISTS vendedores (
  id_vendedor INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(100) NOT NULL,
  meta_mensal DECIMAL(12,2) NOT NULL,
  percentual_base DECIMAL(5,2) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_vendedor),
  CONSTRAINT chk_vendedores_nome CHECK (CHAR_LENGTH(TRIM(nome)) > 0),
  CONSTRAINT chk_vendedores_meta CHECK (meta_mensal >= 0),
  CONSTRAINT chk_vendedores_percentual CHECK (percentual_base >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS regioes (
  id_regiao INT NOT NULL,
  nome_regiao VARCHAR(50) NOT NULL,
  percentual_bonus DECIMAL(5,2) NOT NULL,
  PRIMARY KEY (id_regiao),
  UNIQUE KEY uq_regioes_nome (nome_regiao),
  CONSTRAINT chk_regioes_percentual CHECK (percentual_bonus >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vendas (
  -- O código é informado pelo cliente da API; não usar AUTO_INCREMENT neste campo.
  id_venda INT NOT NULL,
  id_vendedor INT NOT NULL,
  id_regiao INT NOT NULL,
  data_venda DATETIME NOT NULL,
  valor_venda DECIMAL(12,2) NOT NULL,
  tipo_cliente ENUM('PF','PJ') NOT NULL,
  valor_comissao DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id_venda),
  KEY idx_vendas_vendedor_data (id_vendedor, data_venda),
  KEY idx_vendas_regiao_data (id_regiao, data_venda),
  KEY idx_vendas_data (data_venda),
  CONSTRAINT fk_vendas_vendedor FOREIGN KEY (id_vendedor)
    REFERENCES vendedores (id_vendedor)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_vendas_regiao FOREIGN KEY (id_regiao)
    REFERENCES regioes (id_regiao)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_vendas_valor CHECK (valor_venda > 0),
  CONSTRAINT chk_vendas_comissao CHECK (valor_comissao >= 0)
) ENGINE=InnoDB;

-- Regiões com identificadores estáveis: 1 Norte, 2 Nordeste, 3 Sudeste, 4 Sul.
-- INSERT IGNORE permite reexecutar o script sem duplicar regiões existentes.
INSERT IGNORE INTO regioes (id_regiao, nome_regiao, percentual_bonus) VALUES
  (1, 'Norte', 1.00),
  (2, 'Nordeste', 1.00),
  (3, 'Sudeste', 0.00),
  (4, 'Sul', 0.50);

-- Dados iniciais de demonstração. IDs explícitos facilitam a reprodução dos testes.
INSERT IGNORE INTO vendedores (id_vendedor, nome, meta_mensal, percentual_base, ativo) VALUES
  (1, 'Ana Souza', 10000.00, 5.00, TRUE),
  (2, 'Bruno Lima', 8000.00, 4.00, TRUE),
  (3, 'Carla Mendes', 12000.00, 5.50, TRUE),
  (4, 'Diego Santos', 7000.00, 4.50, TRUE),
  (5, 'Elisa Costa', 9000.00, 5.00, TRUE);

-- As comissões foram calculadas com percentual_base + bônus do cliente + bônus regional.
-- As 21 vendas usam outubro de 2026 para permitir reproduzir o relatório sugerido no enunciado.
INSERT IGNORE INTO vendas
  (id_venda, id_vendedor, id_regiao, data_venda, valor_venda, tipo_cliente, valor_comissao)
VALUES
  (1001, 1, 1, '2026-10-01 09:00:00', 3000.00, 'PJ', 270.00),
  (1002, 1, 3, '2026-10-02 09:15:00', 2500.00, 'PF', 175.00),
  (1003, 1, 4, '2026-10-03 10:30:00', 2000.00, 'PJ', 170.00),
  (1004, 1, 2, '2026-10-04 11:00:00', 3000.00, 'PF', 240.00),
  (1005, 2, 1, '2026-10-05 14:00:00', 1500.00, 'PF', 105.00),
  (1006, 2, 2, '2026-10-06 13:00:00', 1800.00, 'PJ', 144.00),
  (1007, 2, 3, '2026-10-07 12:30:00', 2000.00, 'PJ', 140.00),
  (1008, 2, 4, '2026-10-08 09:45:00', 1000.00, 'PF', 65.00),
  (1009, 3, 3, '2026-10-09 15:00:00', 4000.00, 'PJ', 340.00),
  (1010, 3, 1, '2026-10-10 15:30:00', 3500.00, 'PJ', 332.50),
  (1011, 3, 2, '2026-10-11 16:00:00', 2500.00, 'PF', 212.50),
  (1012, 3, 4, '2026-10-12 16:30:00', 2500.00, 'PF', 200.00),
  (1013, 4, 3, '2026-10-13 10:00:00', 2000.00, 'PF', 130.00),
  (1014, 4, 4, '2026-10-14 10:30:00', 2500.00, 'PJ', 200.00),
  (1015, 4, 1, '2026-10-15 11:00:00', 1800.00, 'PF', 135.00),
  (1016, 4, 2, '2026-10-16 12:00:00', 1200.00, 'PJ', 102.00),
  (1017, 5, 3, '2026-10-17 13:00:00', 1000.00, 'PJ', 80.00),
  (1018, 5, 4, '2026-10-18 13:30:00', 1800.00, 'PF', 135.00),
  (1019, 5, 1, '2026-10-19 14:00:00', 2000.00, 'PJ', 180.00),
  (1020, 5, 2, '2026-10-20 14:30:00', 1500.00, 'PF', 120.00),
  (1021, 5, 3, '2026-10-21 15:00:00', 1400.00, 'PJ', 112.00);

-- Consultas de conferência sugeridas:
-- SELECT COUNT(*) AS quantidade FROM vendedores;
-- SELECT COUNT(*) AS quantidade FROM vendas;
-- SELECT r.nome_regiao, SUM(v.valor_venda) AS total
--   FROM vendas v JOIN regioes r ON r.id_regiao = v.id_regiao
--   GROUP BY r.id_regiao, r.nome_regiao ORDER BY r.id_regiao;
-- SELECT ve.id_vendedor, ve.nome, SUM(v.valor_venda) AS total_vendido,
--        SUM(v.valor_comissao) AS comissao_total
--   FROM vendedores ve LEFT JOIN vendas v ON v.id_vendedor = ve.id_vendedor
--   AND v.data_venda >= '2026-10-01' AND v.data_venda < '2026-11-01'
--   GROUP BY ve.id_vendedor, ve.nome ORDER BY ve.id_vendedor;
