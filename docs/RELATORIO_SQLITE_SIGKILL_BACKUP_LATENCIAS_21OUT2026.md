# LOOP 3.0 — Falhas abruptas internas, integridade de backup e contenção WAL

**Data:** 21/10/2026. Testes exclusivamente de laboratório, sem PSP, saque bancário, CPF real, deploy, merge ou dados de produção.

## Estado de referência e fontes

- PR #1 `DRAFT`, branch `fix/teste-escrita-catraca-20261014`.
- Primeiro arquivo de teste: `test/loop-v6-sqlite-sigkill-interno-backup-corrompido.test.js`, incorporado no commit `f3fde305e41989e77622dbd7ef44b48e1f5389b3`.
- Segundo arquivo: `test/loop-v6-sqlite-seis-processos-latencias.test.js`. Consultar no CI os resultados medidos após a rodada final.
- CI confirmado para SIGKILL + backup (antes da bateria de métricas): [Testes do LOOP, run 39676300272](https://github.com/jjinvest/loop-app/actions/runs/39676300272), **476/476 testes aprovados, zero falhas**. Testes de navegador do mesmo commit também passaram em [run 39676300311](https://github.com/jjinvest/loop-app/actions/runs/39676300311).

## A. Processo encerrado após escrita interna e antes de COMMIT

Ensaio passou de um trigger SQL que lança exceção para encerramento real do processo executor do código Node. Um instrumentador de **teste** intercepta apenas o `StatementSync.run` correspondente a um ponto previamente escolhido. Ele aguarda a inserção SQLite terminar **dentro da transação comercial**, e então dispara `SIGKILL` antes de a função voltar para executar `COMMIT`. Nenhum hook foi instalado no código do motor nem na produção.

- Três pontos independentes da compra PDF: logo após a linha de compra (`admin_ponte_compras_demo`), após a linha de valor de referência (`admin_ponte_posicoes_valores_demo`) e após gravar o snapshot (`admin_ponte_estado_demo`). Cada processo terminou por `SIGKILL` como esperado.
- Após cada encerramento, SQLite foi reaberto por nova conexão: compras, vínculos de pagamento, referências e o próprio JSON do motor eram **iguais ao estado anterior**. `PRAGMA integrity_check=ok`, `foreign_key_check=[]`, e auditoria de posições sem divergências.
- Repetir a operação legítima após reinício criou **somente um registro**; novo reenvio foi idempotente. Total de prova: **quatro PDFs confirmados e quatro posições** (um já aprovado antes dos testes e três recuperados), sem venda parcial ou duplicação.

Log `LOOP_SIGKILL_COMPRA`:
```json
{"interrupcoesInternas":3,"pontos":["compra","referencia","snapshot"],"pedidosRecuperados":3,"pedidosNoFinal":4,"posicoesNoFinal":4,"vendasParciais":0,"duplicacoes":0,"sqliteIntegridade":"ok","pspReal":false}
```

## B. `SIGKILL` dentro da solicitação de saque

- Titular ativado, convidado verde, bônus **R$25 fictícios** provisionado, taxa atual **0%**.
- Instrumentador de teste derrubou processo logo após `INSERT` em `admin_solicitacoes_saque_demo` e antes do `COMMIT`.
- Após reabrir, a solicitação não havia sido persistida; bônus continuava disponível. Reenvio posterior gerou **uma** solicitação, com **R$25 brutos, R$0 de tarifa e R$25 líquidos simulados**, sem segundo desconto na reserva.
- Reserva de teste: R$500 de saldo bruto arbitrário menos R$25 de compromisso de bônus = **R$475 livres**, antes e depois do pedido de saque, sem transferência bancária.

Log `LOOP_SIGKILL_SAQUE`:
```json
{"interrupcoesDentroDoInsert":1,"saquesPersistidos":1,"brutoCentavos":2500,"tarifaParticipanteCentavos":0,"liquidoCentavos":2500,"livreReservaSimuladaCentavos":47500,"duplicacoes":0,"sqliteIntegridade":"ok","transferenciaReal":false}
```

## C. Rejeição de backup alterado ou truncado

- Fonte de teste: **12 compras PDF**, 12 posições persistidas.
- SQLite executou `VACUUM INTO` para gerar uma imagem válida. O teste registrou **manifesto SHA-256 + tamanho** e verificou integridade de SQLite e chaves estrangeiras em conexão `readOnly`.
- Duas cópias **somente para teste** foram manipuladas: bytes alterados no meio do arquivo e arquivo truncado na metade. Ambas foram **rejeitadas antes de abrir ou restaurar**, pois seu checksum/tamanho divergia do manifesto.
- Imagem original com manifesto válido foi restaurada em outro caminho. Os 12 pedidos e seus snapshots passaram nas conferências; reprocessamento não duplicou posição; fonte original permaneceu intacta.

Log `LOOP_BACKUP_HASH`:
```json
{"comprasRestauradas":12,"imagensInvalidasRecusadas":2,"copiaVerificadaAntesDeAbrir":true,"hash":"SHA-256","originalIntacto":true,"restauracaoConsistente":true,"integridade":"ok","backupOffsite":false}
```

O manifesto é apenas uma prova local da correspondência entre bytes observados; **não constitui autenticação externa**, assinatura digital confiável nem segurança contra um invasor que possa modificar tanto a imagem quanto o próprio manifesto.

## D. Contenção e latências de seis processos

O teste adicional executa seis Node.js com conexões próprias ao **mesmo arquivo SQLite WAL local** e mede latência individual das tentativas de gravação/deduplicação com `performance.now`, `p50/p95/p99`, máximos, duração do lote e ocorrência de `SQLITE_BUSY`. Os números **devem vir somente do log `LOOP_LATENCIAS_6_PROCESSOS` de uma execução verde**, não de estimativa nem de comparação informal. A medição não equivale a seis servidores ou muitos usuários por rede. O tempo total inclui o exercício real do CI e não estabelece SLA de produção.

**Status desta seção: em validação na rodada do CI.** O valor final e o identificador da execução serão acrescentados após aprovação. Uma tentativa preliminar falhou porque o teste consultou tabela opcional de saques não criada no cenário restrito a compras; a expectativa foi retirada, sem mudar domínio ou regra vigente.

## Limites e próximos riscos

- Ainda não cobre perda de energia física, defeito de hardware, múltiplos hosts com banco em rede, corrupção produzida por falha de disco, backup offline/offsite com gestão de chaves, retorno RPO/RTO acordado, webhook de PSP real, conciliação bancária independente ou validação jurídica/tributária de produção.
- Requer ensaios posteriores de conciliação cruzada com pagamentos fictícios e estornos, testes de pico HTTP/usuários virtuais e eventual política de operação que impeça liquidações em caso de divergência material.
- **Preservação:** nenhuma UI aprovada, regra da fila/catraca ou taxa de saque 0% foi alterada neste conjunto; PR rascunho e `main` intocados. Relatórios anteriores ficam integralmente guardados como histórico.
