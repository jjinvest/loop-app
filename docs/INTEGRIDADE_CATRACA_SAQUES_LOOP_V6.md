# LOOP V6 — Integridade da catraca e solicitação de saques fictícios

Data: 16/10/2026 · Etapa técnica, **sem mudanças na aparência**.

## Recuperação de estado da catraca

A recuperação de snapshot agora verifica, além da ordem das seis vendas e do ID da posição central:

- se o **destino do cofre** de cada evento corresponde à titularidade do centro no momento do registro;
- se a **origem do titular** (participante comum, dourada assumida por prazo ou desistência) corresponde à posição central;
- se os eventos 1/3/5 do centro pertencente ao LOOP estão marcados exclusivamente como `LOOP_DOURADAS` e os demais eventos respeitam investimento/reserva;
- se posições reais têm destinação `LOOP_CENTRO`, sem campo que faça parecer douradas;
- se tanto o ciclo em andamento quanto os ciclos concluídos carregam os destinos corretos;
- se IDs de vendas permanecem únicos e a catraca não aceita registros inconsistentes.

Os snapshots V5 legados (cinco vagas, cinco eventos históricos sem marcações de cofres) continuam reconhecidos sem forjar novas receitas, transferências ou pagamentos. Quando um registro antigo **possui** marcação de cofre, a marcação existente também precisa ser coerente. O histórico original nunca é reescrito para acomodar dados adulterados. O motor recusa estados incorretos antes de voltar a operar.

Código: `src/domain/estado-simulacao.js`. Testes novos: `test/catraca-v6-integridade-financeira-snapshot.test.js`.

## Proteção da API de saques simulados

A API de solicitações de saque já contém livro persistente, mínimo **R$ 25**, taxa **3%**, reserva fictícia e idempotência. Foi complementada com teste de **ponta a ponta via HTTP** cobrindo:

- rejeição sem login ou sem o cabeçalho interno `X-LOOP-LAB`;
- rejeição de origem cross-site e campos forjados, como `contaId` e `saldoSimuladoCentavos`;
- obtenção da conta exclusivamente pelo cookie de sessão;
- comissão validada de indicação fictícia antes da reserva;
- preservação da taxa exata: bruto R$25,00 → taxa R$0,75 → líquido projetado R$24,25;
- dois pedidos distintos de R$25 só quando a provisão total fictícia é suficiente;
- repetição do mesmo identificador não cria segunda reserva;
- mesmo identificador com outro valor ou outra conta provoca conflito;
- conta B não visualiza o histórico da conta A;
- pedidos com menos de R$25 e tipos desconhecidos são negados;
- participação de lucro permanece bloqueada até existir um livro de saldo autorizado e reconciliado;
- não há transferência, PIX, saldo bancário ou lançamento de caixa real.

Código: `src/routes/participante-laboratorio-demo.js`, `src/domain/solicitacoes-saque-demo-sqlite.js`. Teste novo: `test/saques-v6-http-sessao-privacidade-integridade.test.js`.

## Restrições de operação

Estes controles **não validam o modelo comercial** e não autorizam operação real, promessas de rendimentos ou captação de recursos. Antes de um lançamento com dinheiro, continuam faltando: avaliação jurídica e de viabilidade do fluxo de pagamentos, contratos válidos, proteção ao consumidor/LGPD, autenticação e antifraude de produção, PSP com confirmações autenticadas, entrega de produtos, gestão de estornos, livro financeiro efetivo e auditoria independente.

Este trabalho foi realizado na branch de desenvolvimento `fix/teste-escrita-catraca-20261014`; sem merge ou deploy.
