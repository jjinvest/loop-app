# LOOP 3.0 — Estresse de múltiplos processos, WAL, recuperação e integridade financeira (21/10/2026)

**Status: APROVADO EM CI. Exclusivamente laboratório SQLite descartável, sem dinheiro, dados pessoais reais, merge ou deploy.**

## Referências verificáveis
- Branch: `fix/teste-escrita-catraca-20261014`; PR #1 permanece **DRAFT**.
- Teste novo: `test/loop-v6-sqlite-multiprocessos-wal-financeiro.test.js`.
- Commit que introduziu a bateria: `1c32b596e091e96ecc95db2342013e1d588e34b5`.
- GitHub Actions `Testes do LOOP`: [run 39670562137](https://github.com/jjinvest/loop-app/actions/runs/39670562137), **SUCCESS: 469 testes, 469 aprovados, zero falhas**. Subtestes novos: #227 e #228.
- Resultados estruturados aparecem no próprio log do job como `LOOP_WAL_MULTIPROCESSO` e `LOOP_WAL_FINANCEIRO`. Todo número abaixo é dado de laboratório, não de operação bancária.

## Teste A — Quatro processos reais e arquivo SQLite/WAL compartilhado

1. Foram cadastrados **320 compradores fictícios independentes** e preparados **640 pedidos identificados**: 320 PDFs elegíveis R$250 e 320 físicos R$190 não elegíveis, sem posições.
2. **Quatro processos Node.js independentes** abriram conexões ao mesmo arquivo SQLite no mesmo host, sincronizaram o início por mensagens IPC e processaram os mesmos 640 pedidos em ordens distintas. Isso equivale a **2.560 tentativas de processamento sob concorrência entre processos**, não a 2.560 consumidores humanos ou máquinas distribuídas.
3. Resultado: **640 pedidos novos gravados exatamente uma vez**, **1.920 notificações duplicadas reconhecidas**, **320 posições únicas** para os PDFs, **320 vendas físicas sem posição**, zero posições adicionais, zero bonificações e saques nessa etapa.
4. Depois de fechar os escritores, leitura independente confirmou: contagem das 640 titularidades, 320 titulares de PDFs, reconciliação `auditarIntegridadeOperacionalDemo` = `SEM_DIVERGENCIAS_DETECTADAS`, `PRAGMA integrity_check=ok` e `PRAGMA foreign_key_check=[]`.
5. Foi aberta uma transação **deliberadamente não confirmada numa tabela exclusiva do teste**, com `BEGIN IMMEDIATE` e uma inserção temporária de R$250 referenciais. O processo foi encerrado por `SIGKILL`; ao reabrir o SQLite, a inserção não confirmada **não existia**, enquanto os 640 pedidos e 320 posições previamente confirmados permaneciam íntegros. Foi executado `PRAGMA wal_checkpoint(TRUNCATE)` e houve nova reabertura e verificação.

**Limite da injeção de falha:** `SIGKILL` atingiu uma escrita aberta na **tabela de prova**, não a instrução interna de compra, provisão ou saque num ponto aleatório. Comprova rollback da transação SQLite em WAL naquele cenário, não cobre todas as janelas de pane física, power loss ou pagamentos reais.

Log emitido:

```json
{"processosEscritores":4,"compradores":320,"pedidosConfirmados":640,"entregasConcorrentes":2560,"duplicatasIgnoradas":1920,"posicoesUnicas":320,"rollbackAposSigkill":true,"auditoriaOperacional":"SEM_DIVERGENCIAS_DETECTADAS","checkpointWal":true,"integridade":"ok","pspReal":false}
```

## Teste B — Disputa financeira real entre processos, porém com valores SIMULADOS

Em **outro SQLite temporário**: um titular ativou sua posição individualmente; três convidados vinculados à sua indicação compraram PDF e somente após aceite **verde individual** geraram **3 × R$25 = R$75** de bonificações provisionadas (7.500 centavos).

Quatro processos Node disputaram o mesmo identificador de saque fictício de **R$25** e depois tentaram quatro identificadores distintos, sempre com `BEGIN IMMEDIATE` do módulo existente. Resultado:

- ID compartilhado: **uma solicitação criada, três retornos idempotentes**.
- Quatro solicitações adicionais: **duas aceitas e duas bloqueadas** por `SALDO_SIMULADO_INSUFICIENTE`.
- Conjunto final: **três solicitações de R$25**, total bruto simulado **R$75**, taxas de **3% = R$0,75 por saque / R$2,25 no total**, líquidos simulados **R$72,75**. Nenhum pagamento bancário executado.
- Todos os processos tentaram repetir o mesmo ID com valor diferente; os quatro receberam `CONFLITO_IDEMPOTENCIA`.
- Livro conferido após fechar e reabrir: **7.500 centavos de bônus, 7.500 centavos comprometidos em solicitações, zero disponível para novo saque**, três registros imutáveis e integridade SQLite aprovada.
- Segundo caixa/reserva com **R$500 brutos fictícios**: bonificações provisionadas = **R$75**, reserva livre fictícia = **R$425**. As três solicitações apenas utilizaram bônus já comprometidos; **não reduziram novamente a reserva**.

Log emitido:

```json
{"processos":4,"bonificacoesVerdesCentavos":7500,"saqueCompartilhadoUnico":1,"duplicatasSaque":3,"saquesAdicionaisAceitos":2,"saquesBloqueadosSemSaldo":2,"saquesPersistidos":3,"totalBrutoCentavos":7500,"taxasCentavos":225,"liquidoCentavos":7275,"reservaLivreCentavos":42500,"debitoReservaDuplicado":false,"financeiroReal":false,"integridade":"ok"}
```

## Delimitação e próximos ensaios

- Teste **multiprocesso de verdade**, com conexões e PIDs independentes, porém **um único host e um único arquivo WAL**. Não demonstra desempenho de 4 servidores remotos com banco compartilhado por rede, nem 5.000 clientes simultâneos.
- A leitura dos comprovantes é uma fonte interna **fictícia e confiável** montada a partir dos pedidos identificados persistidos. Não comprova liquidação Pix, autenticação PSP, conciliação de extratos ou envio bancário.
- A reserva foi alimentada com **R$500 artificiais**, sem giro real do tabuleiro/receita de clientes. Valores provisionados não são disponibilidades bancárias.
- Ainda exigem ensaio: reinício forçado em pontos internos da escrita de compras e saldos; backups consistentes e restauração verificável; cargas maiores e tempos de resposta/contenda quantificados; divergências de webhook/PSP e extrato; integração de obrigações reais, custos, estornos, privacidade e assessoramento jurídico/financeiro.
- **Nenhuma UI, regra comercial, motor real, branch principal, PR status, deploy ou publicação foi alterado**. Este relatório complementa e **não substitui** o histórico nem os testes anteriores de 240/500/5.000 compradores.
