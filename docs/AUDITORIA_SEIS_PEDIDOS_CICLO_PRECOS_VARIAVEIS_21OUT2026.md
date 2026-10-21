# LOOP 3.0 — Regra comercial de preços variáveis e auditoria de seis fontes por ciclo (21/10/2026)

## 1. Decisão do proprietário — PREVALECE sobre exemplos do laboratório

**VIGENTE, seção 85 do comando-mestre:** o **PDF é o único produto comercial planejado a R$250**. Qualquer outro produto efetivamente colocado à venda terá preço **superior a R$250**, mas **o proprietário decide o valor individual** usando custos variáveis, fornecedor e sua estratégia de resultados; o assistente **não deve congelar margens ou impor fórmulas fixas de precificação**.

Os R$190 de produtos físicos em testes passados eram **valores fictícios de regressão**, e não preços comerciais vigentes. O mesmo vale para cenários matemáticos de hipotético custo R$10 ou lucro R$30: não são custos reais. A documentação anterior permanece preservada como histórico, mas **nenhum exemplo numérico substitui a decisão posterior do dono**. Não fazer alterações de SKU, preços, margens ou visuais sem ordem expressa. A elegibilidade ao LOOP continua sendo escolha/configuração separada do **preço de varejo**, e as posições são confirmadas individualmente.

## 2. Auditoria nova — apenas laboratório

### Código

- `src/domain/auditoria-seis-pedidos-ciclo-lab.js`: módulo de **leitura exclusivamente**, verifica para cada giro com livro de provisões: seis eventos numerados de 1 a 6, correspondência de evento ↔ pedido fictício/posição, ausência de duplicidade entre ciclos, referências de valor válidas, presença de aportes **somente artificiais** e concordância com snapshot persistido do motor. Não permite pagamentos, giros, saques, reclassificação comercial ou bloqueio de PSP.
- `test/loop-v6-seis-pedidos-ciclo-persistencia-auditoria.test.js`: teste usa apenas compras fictícias do PDF R$250. **Não usa SKU físico ou preços de produtos futuros**, nem supõe margem/custo de fornecedor.

### Resultado verificado

**GitHub Actions [run 39690331754](https://github.com/jjinvest/loop-app/actions/runs/39690331754), SUCCESS: 500 testes aprovados, 0 falhas**. **[Navegador celular/tablet/computador run 39690331661](https://github.com/jjinvest/loop-app/actions/runs/39690331661): SUCCESS**, sobre o mesmo commit de código, código testado em commit `6996ee3436cbbeb8a26990ed842f160a1b04c3c8`.

- **14 pedidos fictícios de PDF**, todos com compra confirmada apenas pelo verificador de laboratório.
- **Dois giros persistidos**, seis pedidos distintos para cada um, 12 eventos documentados e **dois pedidos ainda não consumidos pelo ciclo**.
- Com somente cinco aportes fictícios, tentativa de giro recusada por saldo demonstrativo central insuficiente; nenhum giro ou lançamento parcial foi gravado.
- Com as entradas fictícias suficientes registradas separadamente e START explícito, foram documentados **dois ciclos completos**. O livro dos seis eventos por giro correspondeu ao snapshot do motor, sem reutilizar o mesmo pedido em dois eventos.
- Tentativas de atualizar/deletar provisões foram recusadas pelo mecanismo de imutabilidade, replay do comando de giro foi idempotente, reabertura do banco preservou os dois giros e os 12 eventos, auditoria SQLite/foreign keys e conciliação fictícia sem divergências.
- Os livros foram auditados **sem movimentar dinheiro e sem provar pagamento externo**: `pagamentosReaisComprovados=0`, `liquidacaoOuSaqueReal=false`.

Log relevante:
```json
{"comprasPdfFicticias":14,"girosFicticiosPersistidos":2,"eventosFicticiosContabilizados":12,"eventosPorGiro":6,"pedidosFicticiosDistintos":12,"comprasPendentes":2,"giroSemLastroSimuladoRejeitado":true,"alteracaoLivroImutavelRecusada":true,"replayDoComandoIdempotente":true,"reaberturaSqliteIntegra":true,"conciliacaoCofresFicticiaDivergencias":0,"pagamentosReaisComprovados":0,"liquidacaoOuSaqueReal":false,"semMudancaDePrecoDeProduto":true}
```

## 3. Limites da conclusão e próximas dependências

Este teste **não valida a liquidação bancária, captura do PIX, encargos reais, margem efetiva, rentabilidade do produto, autorização de benefício ou capacidade de sustentar o modelo de negócios**. O aporte separado é um lançamento local demonstrativo que não pode ser confundido com dinheiro recebido. A decisão de preço e margem permanece com o proprietário; a avaliação jurídica e contábil especializada do modelo completo permanece pendente antes de lançamento real.

A próxima prioridade técnica segura é reforçar os diagnósticos **somente leitura** de divergências e estornos tardios sobre ciclos **já documentados**, inclusive rastrear qual pedido compôs qual giro e avaliar impactos sem alterar posições/benefícios. Qualquer integração real com PSP deve depender de credenciais de sandbox do prestador escolhido, provas de conciliação real e validação jurídica.

## Preservação

PR #1 `fix/teste-escrita-catraca-20261014` permanece DRAFT, sem merge, deploy ou publicação, como pactuado. Nenhuma tela nem precificação foi alterada; a taxa de saque ao participante permanece **0%**. Não criar Escritório do Administrador sem pedido explícito.
