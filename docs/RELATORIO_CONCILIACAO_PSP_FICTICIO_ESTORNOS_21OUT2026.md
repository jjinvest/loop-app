# LOOP 3.0 — Conciliação externa fictícia: pagamentos, estornos, posições e reservas

**Data: 21 de outubro de 2026.** Escopo: laboratório isolado, leitura do SQLite e fixture independente de eventos de pagamento **totalmente fictícios**. Nenhum PSP, banco, carteira, Pix, CPF real, dinheiro real ou estorno bancário foi acessado.

## Objetivo e implementação

Criado o módulo **somente de leitura** `src/domain/auditoria-extrato-psp-ficticio-loop.js` para comparar uma coleção de eventos externos artificiais com os dados SQLite efetivos do carrinho, titularidade congelada do pedido, ponte, posições, venda física, comissão provisionada e solicitações de saque **simuladas**. Nenhuma rota HTTP, UI de admin ou de participante, autorização de pagamento, mudança no motor, regra de fila ou status da posição foi criada.

Entrada do avaliador: `auditarExtratoPspFicticioLoop({carrinhos,eventosExternosFicticios})`, com elementos `eventoId`, `pedidoId`, `intentoPagamentoId`, `valorCentavos` e `tipo` (`CONFIRMACAO_FICTICIA` ou `ESTORNO_FICTICIO`). Isso é apenas um **extrato construído no teste**: não há assinatura criptográfica verificada nem conciliação PSP efetiva.

O auditor:
- compara pagamento com ID de pedido, intento congelado, valor e situação do carrinho;
- separa reenvio idêntico de reutilização divergente do mesmo ID e sinaliza múltiplas confirmações externas distintas, sem contar um reenvio como nova compra;
- sinaliza evento sem pedido correspondente, divergência de valor/intent, confirmação local sem confirmação externa, confirmação externa com pedido local pendente e estorno local sem evento externo correspondente;
- ao identificar estorno fictício válido, destaca posições e vendas de loja ainda persistidas, bônus provisionado na reserva direita e **a existência de solicitações simuladas** para o indicador daquela comissão;
- não alega que uma solicitação de saque do indicador deriva especificamente do pedido estornado; essa vinculação e eventual reembolso precisam de apuração antes de qualquer compensação;
- retorna somente identificadores dos pedidos fictícios, códigos de alertas e totais; não retorna CPF, e-mail, identificador da conta ou dados bancários.

## Resultados validados no GitHub Actions

**[Testes do LOOP — execução 39679484773](https://github.com/jjinvest/loop-app/actions/runs/39679484773): SUCCESS, 481 testes aprovados, zero falhas.** Quatro novos subtestes em `test/loop-v6-conciliacao-externa-negativa-sqlite.test.js`.

### 1. Conciliação íntegra e idempotência após reabertura

Um PDF fictício de R$250 gera uma posição e um produto físico fictício de R$190 gera venda de loja sem posição. Dois eventos de confirmação artificiais coincidem com seus respectivos pedidos e intentos: **zero alertas**. Dois callbacks idênticos foram desconsiderados sem nova posição. Reinício do arquivo SQLite preservou tudo.

Log:
```json
{"pedidos":2,"confirmacoesExternasFicticias":2,"replaysIdenticos":2,"posicoesUnicas":1,"integridade":"ok","somenteLeitura":true,"pspReal":false}
```

### 2. Estorno que envolve direitos já gerados — cenário crítico

Titular fictício e indicado fictício tiveram suas posições **confirmadas individualmente**, conforme regra vigente. A compra do indicado gerou **R$25 de bônus provisionado**; o titular fez uma solicitação de saque **simulado R$25**, com taxa **0%**.

O extrato externo fictício indicou um estorno, enquanto a loja inicialmente ainda registrava pagamento confirmado. A auditoria reconheceu:
- estorno sem reflexo correspondente no estado local;
- **uma posição persistida** e **R$25 de bonificação provisionada** ligados ao pedido estornado;
- indicador associado com uma solicitação de saque fictícia no livro;
- ausência de cobertura na foto do extrato de teste.

O relatório apresentou **exposição, não desfez nenhuma cadeira, vínculo, reserva ou solicitação**. Posteriormente o carrinho recebeu um evento de estorno local: a divergência de estados desapareceu, mas os alertas de posição/comissão já existente continuaram corretamente visíveis. Após reiniciar o banco a exposição persistiu. Com a referência **fictícia** de R$500 no cofre direito, o compromisso de R$25 permaneceu, e a disponibilidade de laboratório era R$475 (sem duplo desconto). Nenhuma transferência foi realizada.

Log:
```json
{"estornoIndependenteDetectado":true,"posicoesExpostas":1,"bonusProvisionadoCentavos":2500,"solicitacaoSaqueSimuladaCentavos":2500,"taxaParticipanteCentavos":0,"caixaLivreDemonstrativoCentavos":47500,"aposReinicio":true,"estornoAutomatico":false,"pspReal":false}
```

### 3. Estados local/external desencontrados

Foram detectados corretamente:
- carrinho local confirmado e posição criada **sem pagamento correspondente no extrato fornecido**;
- evento externo de confirmação com carrinho local ainda **aguardando** e sem posição, sem habilitá-la automaticamente;
- estorno local **não correspondente a um estorno no extrato**.

A leitura não mudou o snapshot das posições, o carrinho nem as reservas.

### 4. Identificadores e valores incorretos

Sete eventos artificiais testaram valor incorreto, intento de pagamento trocado, ID de evento reutilizado com outro conteúdo, evento de pedido inexistente, duas confirmações distintas para um pedido e entrega duplicada idêntica. O auditor apontou todas as inconsistências relevantes, ignorou **um replay idêntico** e não criou nenhuma posição. O relatório não expôs CPF, e-mail nem ID da conta.

Log:
```json
{"eventosFicticios":7,"replayIdenticoIgnorado":1,"identificadoresConflitantes":1,"eventosOrfaos":1,"valorDivergenteDetectado":true,"intentoDivergenteDetectado":true,"confirmacoesDuasFontesDetectadas":true,"dadosPessoaisNoRelatorio":false,"alteracaoPosicoes":false}
```

## Limites e advertências

O resultado **não comprova a origem confiável de eventos bancários**, comunicação com PSP, captura de pagamento, saldo liquidado, reembolso real, existência de receita/lucro, legalidade ou política final de atendimento ao consumidor.

O objetivo do módulo é somente **apontar diferenças**. Não implementa política de decisão/cancelamento de posições após estorno, bloqueio operacional de saldos, distribuição retroativa, devolução de bônus, estorno de solicitação, devolução ao meio de pagamento nem reconciliação independente de conta bancária. Toda essas decisões devem ter regras futuras explícitas, validação jurídica/contábil e trilha auditável antes de habilitar operação real. Uma relação entre estorno e solicitação de saque na **mesma conta do indicador** sinaliza risco, mas não prova causalidade daquela solicitação específica.

O teste inicial da fixture tentou ativar o indicador sem apontar uma posição, o que a regra vigente recusou corretamente (`POSICAO_INVALIDA`). O teste foi corrigido para comprar posição PDF elegível e confirmá-la individualmente; a validação do domínio **não foi afrouxada**. Resultado CI acima já corresponde ao ensaio corrigido.

**Próxima prioridade:** especificar, testar e auditar uma política de *tratamento manual e bloqueio preventivo de casos inconciliados* (sem reverter direitos automaticamente), simular estornos parcial/tardio, falhas e reordenação de eventos com protocolos assinados em sandbox, sem tocar em valores reais ou publicar produtos.

**Preservação:** PR #1 permanece aberto e em rascunho; nenhuma alteração em `main`, sem merge, deploy ou publicação. Motor V6, fila A/B, seis eventos, prioridade, atribuição individual e taxa de saque **0%** mantidos. Referências históricas de testes antigos continuam intactas.
