const mysql = require('mysql2/promise');

// O pool reutiliza conexões e evita abrir uma conexão nova a cada requisição.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'db_vendas',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  decimalNumbers: false,
  charset: 'utf8mb4'
});

async function verificarConexao() {
  const [resultado] = await pool.execute('SELECT 1 AS conectado');
  return resultado[0];
}

module.exports = { pool, verificarConexao };
