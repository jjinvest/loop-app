# LOOP 3.0 / AKITEMM — primeiro ciclo e giro HTTPS com 6 Pix Asaas Sandbox — 06/11/2026

**COMPROVADO EM HOMOLOGAÇÃO, SEM DINHEIRO REAL.** Foi exercitado o ciclo completo na aplicação Railway protegida, conectando **seis pedidos fictícios com seis Pix recebidos e reconsultados pelo Asaas Sandbox** ao mesmo motor, mesmo banco SQLite, tabuleiro e catraca. **Um giro efetivo de ensaio** ocorreu após a sexta venda qualificada e liberação pelo operador.

## Correção funcional e segurança

Antes da correção, `MotorContaUnicaEnsaioSQLite.registrarEvento()` aceitava qualquer pedido já vinculado a uma posição, mesmo sem conferir novamente se o **PSP havia efetivamente registrado recebimento**. O giro conferia apenas posições marcadas como em revisão. Isso podia permitir que um pedido não recebido gerasse evento de ciclo.

Foi integrado ao **motor existente** `_conferirPedidoEventoPSPSandbox()`, que exige `RECEIVED` na última consulta persistida do Asaas Sandbox, conciliação `PAYMENT_RECEIVED` comprovada, vínculo de titular/pagamento válido, ausência de revisão ou suspensão de PSP e lote de compra no motor. A mesma verificação é feita para **todos os seis eventos** novamente no instante de girar, impedindo giro se um PSP mudou de estado no intervalo. Não existe POST de cobrança ou transferência nessa rotina.

A revisão encontrou também uma divergência entre **posição pendente na inbox** e **posição já consumida e vinculada ao motor**: o relatório do administrador contava zero posições pendentes para dois pedidos confirmados, embora ambos tivessem uma posição no motor. `consultarPedido()` passou a expor `posicoesMotorEnsaio` separadamente sem falsificar a contagem de pendências. A exigência equivocada de posição ainda pendente foi removida da guarda do evento. A reconciliação e o motor continuam usando o mesmo SQLite.

## Provas locais e externas

- Provas transacionais no Railway com `test/fluxo-indicacao-compra-sandbox-tabuleiro.test.js`: **seis compras distintas**, evento repetido não computado, apenas cinco não autorizam giro, sexta venda exige catraca aberta, e última consulta PSP divergente entre evento e giro **impede movimento**. Após retorno seguro do registro PSP na fixture, a rotação move `vaga 1 → centro`, zera eventos e conserva caixa real em zero. Nenhum CPF ou autorização comercial verdadeira foi usado.
- Diagnóstico externo de leitura autenticada `scripts/diagnosticar-seis-compras-psp-motor-railway.js`: antes, **3 pedidos totais**, dos quais 2 PSP recebidos/conciliados e 1 **EXIGE_REVISAO** (mantido bloqueado). Motor com **3 ocupantes**, 0 eventos e 0 giros.
- O executável de homologação previamente aprovado `scripts/homologar-cliente-convite-tabuleiro-asaas-preview.js` foi rodado **duas vezes, com opt-in explícito e exclusivo de Sandbox**. Cada execução comprovou 2 contas fictícias, 2 compras e 2 confirmações PIX no PSP Sandbox, 1 convite, 1 posição validada no quadro, sem duplicação; 0 direitos ou créditos financeiros reais. Essas 4 compras complementaram as duas anteriores.
- Novo diagnóstico externo: **7 pedidos históricos**, sendo **6 pagamentos Asaas Sandbox recebidos e reconsultados em 6 pedidos distintos, cada um com 1 posição no motor**; **1 pedido anterior em revisão não foi usado**. Tabuleiro chegou a **7 ocupantes** e permanecia com 0 eventos/0 giros.
- `scripts/provar-seis-eventos-giro-http-preview.js` selecionou **exclusivamente** os 6 pedidos comprovados. Via HTTPS autorizado do Railway, executou 6 eventos, testou replay da primeira venda (não duplicou), a tentativa de giro com 5 eventos e catraca aberta (bloqueada), e a tentativa com 6 eventos porém catraca pausada (bloqueada). Então o operador abriu a catraca e realizou **exatamente 1 giro**, movimentando a vaga 1 para o centro, reiniciando o contador de eventos e **pausando a catraca novamente**.
- A prova inspecionou o estado final da mesma API: **1 giro adicional**, **1 ciclo concluído adicional**, **0 eventos pendentes**, centro atualizado, catraca pausada, **R$ 0 de créditos e saques reais**.

### Evidência externa Railway

- Projeto `loop-asaas-homologacao`, ambiente `homologacao`, serviço `akitemm-escritorio-preview`.
- **Deployment `36fc6efb-5621-4e58-a739-1038606a3d83`: SUCCESS; healthcheck aprovado.**
- Logs identificados: duas ocorrências `LOOP_CLIENTE_COMPRA_CONVITE_TABULEIRO`, dois `LOOP_DIAGNOSTICO_GIRO` (antes/depois) e `LOOP_SEIS_EVENTOS_GIRO_HTTPS`:
  `seisComprasPSPSandbox=true`, `eventosDistintos=6`, `duplicacaoBloqueada=true`, `cincoEventosNaoGiram=true`, `pausaRespeitada=true`, `girosEfetuados=1`, `centroAtualizado=true`, `catracaPausada=true`, `saldoRealCentavos=0`, `saquesReais=0`.
- Logs do proxy mostram `HTTP 200` nas rotas de eventos, catraca e consulta final. Nenhum segredo, identificador de cliente, CPF, e-mail ou ID PSP foi publicado.

## Encerramento seguro do ensaio

Ao concluir a prova:
- `LOOP_PREVIEW_FLUXO_CLIENTE_EXECUTAR=NAO` e `LOOP_PREVIEW_GIRO_E2E_EXECUTAR=NAO`.
- Os comandos one-shot foram retirados do predeploy; permaneceram as regressões direcionadas, a verificação de acesso Asaas **somente GET** e a auditoria de configuração do webhook.
- Fonte de homologação preservada na branch `feature/unificar-escritorio-real-20261105` e PR #1 **DRAFT**, sem merge, cobrança produtiva ou abertura pública.

## O que a prova NÃO certifica

Não é movimentação de dinheiro real, KYC, conta bancária/PIX empresarial, compra real, comissão real, saque, garantia de solvência, transparência de contratos, retenção/LGPD, ou aprovação do modelo comercial. O cliente do laboratório usa contas fictícias e os Pix são confirmados pelo endpoint específico de simulação do Asaas Sandbox. Restam falhas adversariais externas (corte do processo no meio da conciliação, 5xx de webhook originado pelo PSP, concorrência), carga transacional real, logística, operação e validações jurídica/financeira para qualquer lançamento remunerado.
