# Missão 2 — Isolamento de protótipos antigos (LOOP 0.3 / V6)

**Estado:** isolamento de quatro backups executáveis antigos, com preservação íntegra, documentação da precedência das regras e proteção por teste automatizado. **Não é a remoção completa de todos os modos legados do motor.**

## Fonte de verdade e precedência

1. Decisões atuais aprovadas pelo idealizador, consolidadas em [COMANDO_MESTRE_LOOP_03_CONTINUIDADE.md](./COMANDO_MESTRE_LOOP_03_CONTINUIDADE.md).
2. Implementação efetiva e testes do HEAD na branch `fix/teste-escrita-catraca-20261014`; código não equivale a aprovação.
3. Documentos antigos e scripts de simulação são **HISTÓRICO**, nunca autorização para reintroduzir regras revogadas.

Regras vigentes relevantes: tabuleiro com centro + **seis** vagas, entrada pela vaga 6, **seis** eventos válidos por ciclo; posição independente até seis por conta; atribuição manual e imutável de **cada indicado ativo a uma única posição ativa**; no máximo uma posição por titular na Fila A simultaneamente, com liberação escalonada (padrão vaga 6, configurável via admin auditado); Fila B em ordem FIFO; abastecimento 3A:1B. Não criar eventos, compras, pagamentos ou saldos ficticiamente como se reais fossem.

## Código antigo isolado sem execução

Quatro arquivos `src/routes/*.backup*.js` foram copiados **sem alterar os bytes** para `archive/legacy/routes/*.js.txt`; a extensão `.txt` deixa explícito que não são módulos executáveis. Após o arquivamento, os backups foram retirados da pasta ativa `src/routes/`. A história Git preserva também os caminhos originais.

| Original | Arquivo preservado no arquivo morto | Git blob SHA de conteúdo |
| --- | --- | --- |
| `src/routes/catraca.backup.js` | `archive/legacy/routes/catraca.backup.js.txt` | `d805c8c2ebb895f45aa8b15d52858764321b93fc` |
| `src/routes/catraca.backup2.js` | `archive/legacy/routes/catraca.backup2.js.txt` | `25a2cbb44f519e16ba0deb9974d8a138836ea2a9` |
| `src/routes/filas.backup.js` | `archive/legacy/routes/filas.backup.js.txt` | `213dde40ed5c779e13d2fa98e481bc8bc48d6c1c` |
| `src/routes/filas.backup2.js` | `archive/legacy/routes/filas.backup2.js.txt` | `332d711e25e9b2627c5a422cdadd0351e7365f70` |

Esses arquivos eram versões de teste antigas de `filas` e `catraca`. Não tinham referência nos imports de `src/server.js`; o servidor continua usando `src/routes/filas.js` e `src/routes/catraca.js` com a proteção `src/middleware/proteger-simulacao.js`. **Essas rotas atuais ainda são um protótipo restrito de laboratório**, não checkout ou motor de produção. Nenhum endpoint foi removido nesta missão.

## Materiais históricos que NÃO foram eliminados

- `docs/REGRAS_FILAS.md`: registro de lógica anterior de prioridade por participante; não substitui vínculo por posição vigente.
- `docs/LIMITE_CINCO_COMPRAS_POR_CPF.md` e `docs/PRODUTO_ESPECIAL_CINCO_POSICOES_LOOP.md`: estudos V5 de cinco; V6 trabalha com seis. Pedidos históricos preservam suas condições da época.
- `docs/COMANDO_RETOMADA_LOOP_03_18OUT2026.md`: fotografia anterior do código; HEAD e prioridades atuais devem vir do mestre.
- `docs/DIARIO_DECISOES_LOOP_03.md` e simuladores antigos: auditoria/histórico, não fonte independente de regra vigente.
- `src/domain/motor-filas.js` e `src/domain/ponte-compras-convites-demo-sqlite.js` ainda incluem caminhos de compatibilidade quando o modo de atribuição manual não está ligado. **Não apagar sem migrar os testes, snapshots e consumidores legados, e comprovar ausência de regressão.** No servidor do laboratório, o modo por posição é o padrão.

## Travas e verificação

`test/isolamento-prototipos-antigos.test.js` exige que os quatro arquivos históricos existam no arquivo morto **com hash Git exato**, que os antigos `src/routes/*.backup*.js` não existam mais e que `src/server.js` carregue apenas as rotas ativas esperadas, não as antigas. É uma barreira contra retorno acidental dos backups.

**Fora do escopo:** apagar histórico de commits, alterar a fila, motor, SQLite, pagamentos, layouts aprovados, loja AKITEMM ou disponibilizar funções de produção. A migração completa dos ramos de compatibilidade exige uma missão própria com testes de repetição, concorrência, snapshots e uma estratégia de rollback auditável.

**Sem merge, sem deploy e sem dinheiro real.**
