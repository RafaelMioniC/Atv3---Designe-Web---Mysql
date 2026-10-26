# Vendas360 | Gestão de Vendas, Comissões e Performance

O **Vendas360** é uma API Back-End para cadastro de vendedores, registro de vendas, cálculo automático de comissões e acompanhamento de metas e desempenho. O projeto usa Node.js, Express e MySQL, sem Front-End, autenticação ou funcionalidades fora do enunciado.

## 1. Tecnologias e versões

- Node.js 24 LTS ou superior (o projeto declara `node >=24.0.0`).
- Express `5.3.0`.
- `mysql2` `3.24.6`, usando `mysql2/promise`.
- `dotenv` `18.0.8`.
- MySQL 8.0.16 ou superior, para que as restrições `CHECK` do script sejam aplicadas.
- Visual Studio Code com Thunder Client para os testes manuais da API.

As versões das dependências estão fixadas no `package.json`. O desenvolvimento não foi declarado como executado em uma instalação local do MySQL/Thunder Client; siga a seção de testes para validar no seu ambiente.

## 2. Estrutura do projeto

```text
sistema-vendas/
├── src/
│   ├── server.js       # inicialização Express e respostas de erro
│   ├── db.js           # pool e verificação de conexão MySQL
│   ├── funcoes.js      # validações, regras de negócio e consultas SQL
│   └── rotas.js        # endpoints REST
├── sql/
│   └── db_vendas.sql   # banco, tabelas, regiões e dados de demonstração
├── testes/
│   └── comissao.test.js # testes unitários da regra de comissão
├── .env.example        # modelo de configuração
├── .gitignore          # ignora .env e node_modules
├── package.json
└── README.md
```

## 3. Banco de dados

O script cria `db_vendas` e as tabelas `vendedores`, `regioes` e `vendas`, com chaves primárias, estrangeiras, índices e verificações de integridade. Ele não contém `DROP DATABASE`, `DROP TABLE` ou exclusão global. As regiões usam IDs fixos: 1 Norte (1%), 2 Nordeste (1%), 3 Sudeste (0%) e 4 Sul (0,5%). O banco de vendas contém cinco vendedores e 21 vendas de outubro de 2026, com clientes PF e PJ.

### Executar o SQL

1. Abra o MySQL Workbench ou conecte-se pelo terminal.
2. Abra e execute `sql/db_vendas.sql`.
3. Confira os dados com as consultas:

```sql
USE db_vendas;
SELECT * FROM regioes ORDER BY id_regiao;
SELECT COUNT(*) AS total_vendedores FROM vendedores;
SELECT COUNT(*) AS total_vendas FROM vendas;
SELECT r.nome_regiao, SUM(v.valor_venda) AS total_vendido
FROM vendas v
JOIN regioes r ON r.id_regiao = v.id_regiao
GROUP BY r.id_regiao, r.nome_regiao
ORDER BY r.id_regiao;
```

Em uma base nova, o esperado é haver 4 regiões, 5 vendedores e 21 vendas. O script usa `INSERT IGNORE` nos dados de demonstração para evitar duplicação ao executá-lo novamente. Se já houver registros com os mesmos IDs, eles não serão substituídos; confira os dados antes de testar. Não apague uma base existente sem fazer backup.

## 4. Instalar e configurar

Pré-requisitos: Node.js 24 LTS, npm e um servidor MySQL em execução.

Na pasta `sistema-vendas`, instale as dependências:

```bash
npm install
```

Copie `.env.example` para um arquivo chamado `.env` e preencha com as credenciais do seu MySQL. Exemplo para uma instalação local:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=sua_senha_local
DB_NAME=db_vendas
PORT=3000
```

A senha acima é apenas um exemplo de nome de variável, não uma credencial real. Use os valores configurados na sua máquina. **Não envie o `.env` para o GitHub.** O `.gitignore` já o exclui.

Para verificar a versão do Node.js e do npm:

```bash
node --version
npm --version
```

Para conferir a conexão MySQL pelo cliente de linha de comando, quando disponível:

```bash
mysql -h localhost -P 3306 -u root -p db_vendas
```

O programa solicita a senha no terminal. Não a coloque no comando nem em capturas de tela.

## 5. Executar a API

```bash
npm start
```

Para desenvolvimento com reinicialização automática:

```bash
npm run dev
```

Os testes unitários da função de comissão usam o test runner nativo do Node.js:

```bash
npm test
```

Eles validam o exemplo de R$ 180,00, bônus PF/Sul, arredondamento monetário e rejeição de argumentos inválidos. Esses testes não substituem os testes de integração no MySQL e no Thunder Client.

Se o banco estiver acessível, o terminal informa que a conexão foi verificada e a API estará em `http://localhost:3000`. O servidor inicia mesmo se a conexão falhar, para facilitar a demonstração do tratamento de erros; nesse caso, as operações que precisam do banco responderão com erro JSON até a conexão ser corrigida.

Como confirmação inicial, envie `GET http://localhost:3000/vendedores` no Thunder Client. A rota deverá retornar `200 OK` e uma lista JSON.

Faça uma verificação sintática do código com:

```bash
npm run check
```

## 6. Regras de negócio

### Cálculo da comissão

A comissão é calculada no servidor pela função única `calcularComissao()`:

`valor_venda × (percentual_base + bônus_cliente + bônus_região) / 100`

Bônus do cliente: PF = 2%; PJ = 3%. Bônus da região: Norte = 1%; Nordeste = 1%; Sudeste = 0%; Sul = 0,5%. Os percentuais são somados, sem composição percentual. A implementação usa inteiros escalados (`BigInt`) para calcular os centavos e arredonda para duas casas decimais.

Caso de referência: venda de R$ 2.000,00, comissão base de 5%, cliente PJ e região Norte. A taxa total é 5% + 3% + 1% = 9%; comissão esperada: **R$ 180,00**.

O `id_venda` deve ser informado na requisição e não é gerado automaticamente. O servidor verifica duplicidade, vendedor existente e ativo, região existente, data, valor positivo e tipo PF/PJ. Mesmo com a consulta prévia, a chave primária do MySQL continua sendo a proteção final contra duas requisições concorrentes com o mesmo código.

### Relatório de performance

Exemplo:

```http
GET http://localhost:3000/relatorios/performance?inicio=2026-10-01&fim=2026-10-31
```

O dia final é inclusivo: internamente, a consulta usa `data_venda >= inicio` e `data_venda < dia seguinte ao fim`. As datas devem existir e seguir `YYYY-MM-DD`, e `inicio` não pode ser posterior a `fim`.

Os oito indicadores são: total de vendas, vendas por região, vendas por tipo de cliente, melhor vendedor, maior comissão acumulada, metas atingidas, comissão média geral e comissão média por região. A meta mensal usa o mês calendário completo que contém `inicio`, mesmo que o intervalo do relatório cubra parte desse mês. Vendedores sem vendas aparecem na apuração com total zero e não atingem metas positivas. Se houver empate para melhor vendedor ou maior comissão, vence o menor `id_vendedor`. Em um período sem vendas, o total é zero, valores por região/tipo são zero, médias e vendedores de destaque ficam `null` e as metas continuam sendo apuradas para o mês de referência.

## 7. Endpoints

### Exploração e diagnóstico

| Método | Endpoint | Resultado esperado |
|---|---|---|
| GET | `/` | Identidade da API, versão e atalhos para os endpoints principais |
| GET | `/health` | Estado da API e da conexão com o MySQL (`200` conectado; `503` indisponível) |

Abra `http://localhost:3000/` no navegador para ver a apresentação do Vendas360. Use `/health` para distinguir um servidor ativo de uma conexão MySQL funcional. O diagnóstico não expõe credenciais nem detalhes internos do banco.


Todas as respostas são JSON no formato geral `{ "sucesso": true, "mensagem": "...", "dados": ... }`. Erros usam `{ "sucesso": false, "erro": { "codigo": "...", "mensagem": "..." } }`.

| Método | Endpoint | Resultado esperado |
|---|---|---|
| POST | `/vendedores` | `201 Created`, vendedor criado |
| GET | `/vendedores` | `200 OK`, todos os vendedores, inclusive inativos |
| GET | `/vendedores/:id` | `200 OK` ou `404 Not Found` |
| PUT | `/vendedores/:id` | Atualiza meta e percentual base |
| PATCH | `/vendedores/:id/desativar` | Desativa sem apagar o histórico |
| POST | `/vendas` | `201 Created`, venda e comissão calculada |
| GET | `/vendas` | Lista todas as vendas |
| GET | `/vendas/vendedor/:id` | Lista vendas de um vendedor existente |
| GET | `/vendas/regiao/:id` | Lista vendas de uma região existente |
| DELETE | `/vendas/:id` | Exclui venda existente; `404` se não existir |
| GET | `/relatorios/performance?inicio=AAAA-MM-DD&fim=AAAA-MM-DD` | Retorna os oito indicadores |

Códigos usados: `200`, `201`, `400` para validação, `404` para registros inexistentes, `409` para código de venda duplicado e `500` para falhas inesperadas ou de banco. Não são incluídos detalhes internos da conexão nas respostas.

### Exemplos de corpo JSON

Cadastro de vendedor (`POST /vendedores`):

```json
{
  "nome": "Vendedor de Teste",
  "meta_mensal": 5000.00,
  "percentual_base": 5.00
}
```

Atualização (`PUT /vendedores/6`):

```json
{
  "meta_mensal": 6500.00,
  "percentual_base": 5.50
}
```

Registro de venda (`POST /vendas`):

```json
{
  "id_venda": 9001,
  "id_vendedor": 1,
  "id_regiao": 1,
  "data_venda": "2026-09-30T18:00:00",
  "valor_venda": 2000.00,
  "tipo_cliente": "PJ"
}
```

Não envie `valor_comissao`: o servidor calcula esse valor com base nos registros do vendedor e da região. O ID `6` do exemplo de atualização pressupõe que os cinco vendedores de demonstração foram inseridos primeiro e que não havia outros registros ocupando IDs automaticamente gerados; use o ID retornado no seu próprio cadastro.

Resposta esperada para o registro da venda de exemplo (`201 Created`; os valores `DECIMAL` são serializados como strings pelo driver):

```json
{
  "sucesso": true,
  "mensagem": "Venda registrada com sucesso.",
  "dados": {
    "id_venda": 9001,
    "id_vendedor": 1,
    "nome_vendedor": "Ana Souza",
    "id_regiao": 1,
    "nome_regiao": "Norte",
    "data_venda": "2026-09-30 18:00:00",
    "valor_venda": "2000.00",
    "tipo_cliente": "PJ",
    "valor_comissao": "180.00"
  }
}
```

Resposta esperada ao repetir o mesmo código (`409 Conflict`):

```json
{
  "sucesso": false,
  "erro": {
    "codigo": "VENDA_DUPLICADA",
    "mensagem": "Já existe uma venda com esse id_venda."
  }
}
```

O relatório segue a mesma estrutura JSON. O conteúdo de `dados` possui `periodo`, `total_vendas`, `vendas_por_regiao`, `vendas_por_tipo_cliente`, `melhor_vendedor`, `maior_comissao`, `metas_mensais`, `comissao_media_geral` e `comissao_media_por_regiao`; a seção seguinte apresenta os valores esperados com os dados iniciais.

## 8. Plano de testes no Thunder Client

No VS Code, abra a extensão Thunder Client, crie uma requisição, escolha o método e informe a URL. Para requisições com corpo, selecione `Body > JSON` e adicione o cabeçalho `Content-Type: application/json`. Use os dados abaixo na ordem sugerida em um banco preparado pelo SQL.

| Nº | Requisição / preparação | Resultado esperado |
|---:|---|---|
| 1 | `POST /vendedores` com o JSON “Vendedor de Teste” acima | `201`; guarde o `dados.id_vendedor` retornado como `ID_TESTE` |
| 2 | `GET /vendedores` | `200`; inclui os 5 vendedores iniciais e o vendedor criado; não oculta inativos |
| 3 | `GET /vendedores/1` | `200`; retorna Ana Souza |
| 4 | `PUT /vendedores/ID_TESTE` com meta `6500.00` e base `5.50` | `200`; valores atualizados |
| 5 | `PATCH /vendedores/ID_TESTE/desativar` | `200`; `ativo` retorna falso/zero e as vendas antigas continuam preservadas |
| 6 | `POST /vendas` com o JSON de venda acima | `201`; `valor_comissao` deve ser `180.00` |
| 7 | Repetir o mesmo `POST /vendas` com `id_venda` 9001 | `409`; não deve surgir segunda venda com o mesmo código |
| 8 | `POST /vendas` usando `id_vendedor: 999999` e um código novo | `404`; vendedor não encontrado e nenhuma venda inserida |
| 9 | `POST /vendas` usando `id_vendedor: ID_TESTE` (já desativado) | `400`; vendedor inativo e nenhuma venda inserida |
| 10 | `POST /vendas` usando `id_regiao: 999999` e vendedor ativo | `404`; região não encontrada |
| 11 | Enviar `valor_venda` igual a `0`, `-10` e `"abc"` em requisições separadas | `400` para cada requisição |
| 12 | `GET /vendas/vendedor/1` | `200`; lista vendas de Ana Souza |
| 13 | `GET /vendas/regiao/1` | `200`; lista as vendas da região Norte |
| 14a | `DELETE /vendas/9001` | `200`; venda de teste excluída |
| 14b | `DELETE /vendas/999999` | `404`; venda não encontrada |
| 15 | `GET /relatorios/performance?inicio=2026-10-01&fim=2026-10-31` | `200`; JSON com todos os oito indicadores |
| 16 | Enviar datas inválidas ou `inicio=2026-11-01&fim=2026-10-01` para o relatório | `400`; mensagem de validação |
| 17 | Para simular indisponibilidade, configure temporariamente `DB_PORT` para uma porta sem MySQL, reinicie a API e envie `GET /vendedores`; depois restaure a porta correta | API inicia com aviso; rota devolve `500` JSON sem credenciais ou rastreamento da exceção |

No teste 6, a taxa esperada é exatamente 9% (base 5% + PJ 3% + Norte 1%), então R$ 2.000,00 × 9% = R$ 180,00. A data do exemplo fica fora de outubro para não alterar o resultado do relatório inicial de demonstração. Se quiser repetir os testes, escolha um `id_venda` livre e um novo vendedor; não dependa de IDs de teste que já foram excluídos.

### Conferir o resultado do relatório

Antes de registrar vendas adicionais em outubro, os dados fornecidos no SQL devem produzir estes resultados no período de 1 a 31 de outubro de 2026:

- Total de vendas: `21`.
- Vendas por região: Norte `11800.00`, Nordeste `10000.00`, Sudeste `12900.00`, Sul `9800.00`.
- Vendas por tipo: PF `20100.00`, PJ `24400.00`.
- Melhor vendedor por valor vendido: Carla Mendes (`12500.00`).
- Maior comissão acumulada: Carla Mendes (`1085.00`).
- Metas atingidas: `2` (Ana Souza e Carla Mendes, com os valores iniciais de meta).
- Comissão média geral: aproximadamente `170.8571`.
- Comissão média por região: Norte `204.50`, Nordeste `163.70`, Sudeste aproximadamente `162.8333`, Sul `154.00`.

Esses valores são referências calculadas a partir dos dados de demonstração no script, não resultados de uma execução real neste computador. Caso os dados sejam modificados, o relatório deve refletir os registros atuais do banco.

### Conferências SQL complementares

```sql
-- A comissão salva para o teste 9001 deve ser 180.00 antes da exclusão.
SELECT id_venda, valor_venda, tipo_cliente, valor_comissao
FROM vendas WHERE id_venda = 9001;

-- Metas por vendedor em outubro/2026.
SELECT ve.id_vendedor, ve.nome, ve.meta_mensal,
       COALESCE(SUM(v.valor_venda), 0) AS total_vendido,
       CASE WHEN COALESCE(SUM(v.valor_venda), 0) >= ve.meta_mensal
            THEN 'ATINGIU' ELSE 'NAO ATINGIU' END AS situacao_meta
FROM vendedores ve
LEFT JOIN vendas v ON v.id_vendedor = ve.id_vendedor
  AND v.data_venda >= '2026-10-01' AND v.data_venda < '2026-11-01'
GROUP BY ve.id_vendedor, ve.nome, ve.meta_mensal
ORDER BY ve.id_vendedor;

-- A venda de teste não deve existir depois do DELETE do teste 14a.
SELECT COUNT(*) AS quantidade FROM vendas WHERE id_venda = 9001;
```

Para registrar evidências para o professor, tire capturas reais da tela do Thunder Client mostrando método, URL, corpo quando aplicável, status HTTP e resposta. Não inclua senha do banco nem conteúdo do `.env` nas imagens.

## 9. Checklist de conformidade

- [x] Três tabelas obrigatórias, chaves primárias/estrangeiras e regiões com IDs fixos.
- [x] Cinco vendedores, 21 vendas, PF/PJ e quatro regiões no script de dados iniciais.
- [x] As dez funções obrigatórias, com `async/await`, `try/catch` nas funções de banco e consultas parametrizadas com `execute()`.
- [x] Vendedor inativo impedido de registrar nova venda; histórico preservado.
- [x] Comissão calculada em uma função única, com arredondamento a duas casas.
- [x] Todos os endpoints solicitados e respostas de erro em JSON.
- [x] Oito indicadores calculados com consultas SQL, agregações e `JOIN`.
- [x] `.env.example` e `.gitignore` para não versionar credenciais.
- [x] Testes unitários da função de comissão e plano de testes reproduzível no Thunder Client.
- [ ] Executar o SQL e validar a API no MySQL local.
- [ ] Capturar evidências reais das requisições/respostas no Thunder Client.

## 10. Limitações e validação pendente

A API e o SQL foram criados para serem compatíveis entre si, mas o funcionamento com seu usuário, senha, porta e versão local do MySQL precisa ser confirmado no seu ambiente. As capturas do Thunder Client também precisam ser feitas durante a execução real; não foram fabricadas capturas nem resultados de execução. Use `npm run check` para validar a sintaxe e siga o plano acima para a auditoria funcional.
