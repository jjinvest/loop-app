# LOOP 3.0 / AKITEMM — Blindagem da origem dos dados no gate de ativação

**04/11/2026 · Seção 202 · Homologação local, sem ativação produtiva**

## Segurança e continuidade
- Preservado o diagnóstico da seção 201, os Escritórios do Cliente e Administrador, as regras de 10 posições ativas por titular e máximo de duas por tabuleiro.
- O diagnóstico agora falha fechado com `FONTE_DIAGNOSTICO_INCONSISTENTE` quando a fonte consultada aponta para outro pré-pedido, outro titular numa leitura autenticada, ou fornece motivos de bloqueio malformados. Esse cheque é redundante ao filtro já existente no SQLite, deliberadamente para reduzir o risco de futuras regressões de isolamento.
- Teste negativo verifica fonte cruzada entre titulares e pedidos, bem como motivos inválidos. Outro teste confirma que um adaptador de identidade configurado apenas como **VERIFICACAO_IDENTIDADE_SANDBOX**, mesmo retornando aprovação, nunca satisfaz KYC externo real.
- O diagnóstico não escreve em posições, filas, tabuleiro, saldo, saque, pagamento ou cofres. Não habilita rotas de ativação e não interpreta aprovação Sandbox como homologação comercial.

## Dependências de fora do laboratório
A etapa seguinte requer prestador de verificação civil externo escolhido e homologado, aceite de termos definitivo e revisão jurídica, pagamento comercial reconciliado, capacidade aferida no motor persistente e autorização operacional explícita. Até lá, `permitidoAtivar`, `permitidoMoverFila`, `permitidoGirar` e `permitidoPagar` permanecem `false`.

## Evidência
A seção 201 tem [CI de integração e segurança aprovado](https://github.com/jjinvest/loop-app/actions/runs/41862522755) e [CI de navegador PC/celular aprovado](https://github.com/jjinvest/loop-app/actions/runs/41862598132). As verificações do **novo código desta seção 202** devem ser avaliadas separadamente no respectivo SHA; não reutilizar o CI anterior para afirmá-las.

PR #1 permanece DRAFT, sem merge, deploy comercial ou operações financeiras reais.
