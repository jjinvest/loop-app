# LOOP 3.0 — Recuperação de transações internas e backup íntegro SQLite/WAL

**Data:** 21/10/2026 — ensaios exclusivamente locais e descartáveis, sem dinheiro real, PSP, CPF real, merge ou deploy.

## Versão e evidências

- Repositório `jjinvest/loop-app`; branch `fix/teste-escrita-catraca-20261014`; PR #1 **DRAFT**.
- Teste adicionado no commit `bda41c50ba845acf3b932ae0cce26a6559dec0ca`: `test/loop-v6-sqlite-recuperacao-interna-backup.test.js`.
- CI: [GitHub Actions Testes do LOOP — run 39672129031](https://github.com/jjinvest/loop-app/actions/runs/39672129031), **SUCCESS: 472 testes, 472 aprovados, zero falhas**. Novos casos #231, #232, #233.
- Logs estruturados: `LOOP_FALHAS_TRANSACAO`, `LOOP_SAQUE_ROLLBACK` e `LOOP_BACKUP_WAL`.
- Documento anterior, preservado integralmente: [concorrência de quatro processos e reserva](./RELATORIO_SQLITE_MULTIPROCESSOS_WAL_SAQUES_21OUT2026.md).

## Ensaio 1 — Falhas injetadas dentro da ponte comercial

Foi criada uma compra PDF inicial, para garantir que o snapshot existia; depois foram preparadas quatro operações identificadas e testadas com triggers `BEFORE INSERT/UPDATE ... RAISE(ABORT,...)`, instalados exclusivamente no banco temporário:

1. **PDF, gravação do vínculo de pagamento:** falha após tentativa de escrever compra no livro comercial, antes de confirmar a transação.
2. **PDF, gravação da referência financeira da posição:** falha depois das gravações anteriores, exigindo rollback conjunto.
3. **PDF, gravação final do snapshot do motor:** falha no `UPDATE` do estado, **após** a geração de posição e gravação dos livros.
4. **Venda física R$190 sem qualificação LOOP:** falha no `INSERT` da venda da loja, sem criar posição.

Após **cada falha**, a aplicação reabriu o arquivo SQLite e comprovou que os totais de compras, vínculos, referências, posições e o snapshot JSON eram **exatamente iguais** aos anteriores à transação falhada. Os pedidos identificados previamente preparados foram preservados, permitindo repetir o processamento. Retirado o trigger de teste, cada operação foi aceita **uma vez**, e o replay subsequente foi reconhecido como duplicata, sem gerar cadeira extra.

**Resultado final:** quatro PDFs gravados e quatro posições (contando o PDF inicial), uma venda física sem posição, quatro recuperações idempotentes, integridade e auditoria sem divergências.

```json
{"injeçõesInternas":4,"recuperacoesIdempotentes":4,"comprasPDF":4,"vendasFisicasSemPosicao":1,"posicoes":4,"integridade":"ok","saquesReais":false}
```

## Ensaio 2 — Rollback da solicitação de saque

Um titular confirmou sua própria posição e um convidado validado e verde produziu bônus de **R$25**. Com o saldo bruto demonstrativo do cofre direito de **R$500** e R$25 de comissão já provisionada, a disponibilidade fictícia era **R$475**.

Um trigger bloqueou a inserção em `admin_solicitacoes_saque_demo`. O módulo `SolicitacoesSaqueDemoSQLite.registrar` reverteu a operação: **nenhum saque gravado**, bônus disponível mantido em R$25, referência de reserva inalterada. Após fechar/reabrir o banco e remover o trigger, a solicitação de **R$25** entrou uma vez, com **3% (R$0,75)** de taxa e líquido fictício **R$24,25**; replay idempotente. A reserva livre continuou **R$475**; o compromisso de comissão **não foi deduzido duas vezes**.

```json
{"solicitacoesConfirmadasNoLivro":1,"duplicatasBloqueadas":1,"saqueBrutoCentavos":2500,"taxaCentavos":75,"reservaLivreCentavos":47500,"injeçõesDeFalha":1,"integridade":"ok","transferenciaExecutada":false}
```

## Ensaio 3 — Backup consistente por `VACUUM INTO`, restauração e WAL

1. Arquivo de origem com **24 clientes** e 48 compras (24 PDFs elegíveis, 24 físicos R$190), mais um titular e um convidado ativo (2 PDFs adicionais): **50 vendas no total, 26 posições únicas**.
2. O convidado verde originou **R$25 de bônus** e o titular realizou **uma solicitação fictícia de saque**, ambas gravadas no livro; reserva de teste livre **R$475** sobre bruto fictício de R$500.
3. Uma **segunda conexão SQLite** abriu `BEGIN IMMEDIATE` e inseriu numa tabela de prova um registro ainda **sem COMMIT**. A conexão original executou `VACUUM INTO ?` para produzir o backup SQLite, enquanto a escrita de teste permanecia aberta. O registro não confirmado ficou **fora** da imagem.
4. O arquivo obtido pelo mecanismo `VACUUM INTO` foi copiado **somente depois de concluído**, com `copyFileSync`, para uma localização independente; **não se copiou ingenuamente o arquivo de banco ativo ignorando WAL**.
5. Ao restaurar e instanciar os serviços, todos os totais de vendas, posições, referências, bônus, saques e snapshot JSON estavam idênticos à fotografia original; auditoria operacional, `PRAGMA integrity_check=ok` e `foreign_key_check=[]` aprovados.
6. A repetição de compra e solicitação de saque já existentes foi **idempotente** na cópia restaurada. Uma compra PDF **posterior** foi criada exclusivamente no original, elevando-o para 27 PDFs/posições, enquanto a cópia continuou com as 26 originais, mesmo após nova reabertura.

```json
{"vendasNoBackup":50,"posicoesNoBackup":26,"bonusProvisionadoCentavos":2500,"saquesFicticiosNoBackup":1,"restauracaoIntegra":true,"escritaPendenteExcluida":true,"posicoesNovasApenasNaOrigem":1,"replayIdempotente":true,"metodo":"VACUUM INTO","integridade":"ok","dadosBancariosReais":false}
```

## Abrangência real e lacunas

**O que esses ensaios provam:** atomicidade sob exceções SQL injetadas em etapas internas selecionadas; rollback da solicitação de saque; persistência após fechar/reabrir; cópia `VACUUM INTO` consistente em modo WAL com outra conexão escrevendo uma transação ainda não confirmada; restauração isolada e replay idempotente.

**O que NÃO provam:** perda súbita de energia, falha física de disco, pane com processo encerrado exatamente no meio de cada etapa comercial, backup criptografado/offsite e sua retenção, recuperação após corrupção física, política RPO/RTO, 5.000 conexões simultâneas, múltiplos servidores, comprovantes PSP/Pix reais, liquidez, conformidade jurídica/tributária ou prontidão de produção.

**Próximos testes recomendados:** encerramento forçado em pontos internos da compra usando processos e barreiras de teste; volumes maiores com métricas de latência `p50/p95/p99` e `SQLITE_BUSY`; validação de restauração diante de backup corrompido; conciliação negativa de webhooks/estornos com livro e posições, mantendo ambientes totalmente artificiais.

**Disciplina preservada:** nenhum arquivo de UI, motor, regra vigente, `main`, merge, deploy ou publicação foi alterado nesta bateria. O PR #1 segue rascunho.
