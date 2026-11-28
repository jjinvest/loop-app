# Ordem de linguagem e controles de Posições — 28/11/2026

Base verificada: `422b9097357884610646677badb0702207a3e20c`, branch oficial `feature/unificar-escritorio-real-20261105`.

## Decisão vigente do proprietário

Retirar das telas e dos estados transitórios avisos sobre valores fictícios, ausência de dinheiro real ou ausência de movimentação real. Não acrescentar novamente esses avisos. Utilizar status objetivos da função e mensagens concretas de erro. A decisão foi incorporada ao `AGENTS.md` para continuidade por outros executores.

Esta é uma alteração de linguagem da interface. Metadados internos, origem dos registros, API, autenticação, autorização, rotas, integridade, limites e travas permanecem iguais. O histórico técnico não é apagado nem são atribuídos saldos a outra fonte.

## Controles solicitados

- `Atualizar posições` é criado dentro do quadro FILAS e mantém a chamada à mesma consulta administrativa da aba. Não são duplicados botões ou endpoints.
- `Gerenciar na Central` fica no final do painel da aba Posições, depois dos indicadores e do controle das douradas, com o mesmo destino `/administrador`.
- Preservados textos dos botões, estilos aprovados, molduras e demais departamentos.

## Implementação

Textos estáticos/adaptados em `interface-aprovada-loop.js`; mensagens dinâmicas e painel em `interface-aprovada-contas.js`; mensagens equivalentes da loja em `interface-aprovada-loja.js` e da Central em `interface-admin-comercial-client.js`. Os estados sem posições informam ausência de posições, sem criar um registro ou apresentar um cartão de exemplo como posição do titular.

Os testes existentes que exigiam os avisos antigos foram ajustados para os novos textos. Permanecem as verificações HTTP de autorização/recusa e os testes de integridade financeira. O teste de navegador também verifica que o botão pertence a FILAS, que o acesso à Central é o último controle do painel e que atualizar continua funcionando.

## Verificações

A renderização efetiva do HTML do Escritório e da loja foi inspecionada; não contém os avisos identificados. O código de backend financeiro e do motor não foi alterado. Não houve START, abertura de porteira, mudança de saldo ou edição de produto/conta publicado.

Regressão geral: 1.788 testes aprovados, zero falhas/cancelamentos/ignorados. Manifesto: 930 arquivos íntegros.

SHA256 do log de regressão: `d0a306cd8360bd9115eef4b19682f5869259cc786eb3e6f7c1eb83a8fe639c39`.
