# LOOP 3.0 / AKITEMM — Qualificação simulada compartilhada

Data: 04/11/2026. **Somente homologação local; sem operação comercial.** Registro de continuidade da seção 197.

## Escopo implementado
O Escritório do Administrador e a vitrine cliente passaram a consultar o **mesmo cálculo do lado servidor**, em `src/domain/simulador-qualificacao-carrinho-candidato.js`, usando os produtos do catálogo SQLite e a classificação de cada item em `SinalizacaoVitrineCandidatoSQLite`. A simulação considera o carrinho completo do pedido atual, nunca soma compras anteriores.

O cálculo diferencia:
- **CINZA:** compra comum, valor não entra no progresso da referência LOOP.
- **VERDE:** somente entra no subtotal potencial se a quantidade daquele produto atingir a quantidade mínima configurada pelo administrador. Mesmo atingindo o mínimo de unidades, o subtotal de produtos verdes aptos do pedido deve alcançar **R$ 250**.
- **EVENTO (dourado/roxo):** aguarda regras especiais e autorização própria; **não** se converte em posição normal e não assume cinco, dez ou qualquer quantidade de posições. A marcação visual não comprova elegibilidade.
- Produtos mistos: total de compra e subtotal de produtos verdes são calculados separadamente. O valor de itens cinza e de eventos não é somado à referência verde.

As respostas informam: status de triagem, subtotais, quanto falta para R$ 250, quantidade mínima de cada produto, revisões das classificações e aviso de dependências. **Todos os retornos mantêm** `posicoesCriadas: 0`, `pagamentosCriados: 0`, `saquesCriados: 0`, `autorizacaoReal: false`, `pagamentoConfirmado: false` e `chequeCpfETermosExecutado: false`.

## Controles e telas
- O Administrador ganhou **Simular a qualificação da compra**, com produto selecionável a partir do cadastro de cores e quantidade informada. Botão *Simular sem executar* chama `POST /staging/escritorio-unificado/simular-qualificacao` com autorização do operador.
- Na cópia local da vitrine AKITEMM aprovada, o carrinho mostra a simulação via `POST /staging/vitrine/simular-qualificacao`, com a sessão de titular, CSRF, marcador do laboratório e resposta calculada pelo servidor. Modificações rápidas do carrinho não sobrescrevem uma resposta mais recente. Os arquivos da loja comercial original continuam intactos.
- A quantidade máxima da cópia de laboratório foi harmonizada com o limite já existente no backend (**50 unidades por produto**). O checkout comercial não foi habilitado.
- Classificar EVENTO agora não ativa o indicador de elegibilidade normal do carrinho, preservando a borda dourado/roxa demonstrativa.
- As novas rotas funcionam apenas em `/staging`, sobre loopback. O ambiente `production` permanece bloqueado.

## Gates ainda fechados
Atingir o valor de referência **não comprova compra nem qualifica automaticamente uma pessoa**. Faltam verificação de titularidade, CPF e termos aplicáveis, confirmação de pagamento com fonte independente, regras e limite de posições por titular, vínculo com filas/tabuleiro, contabilidade/cofres, aprovação operacional e análise jurídica independente. Nenhum dos endpoints escreve nos saldos, posições, giros ou pagamentos.

## Evidência
O workflow de segurança e integração com novos cenários de referência, quantidade, mistos, eventos, isolamento e bloqueios concluiu com sucesso: https://github.com/jjinvest/loop-app/actions/runs/41814727301

O teste adicional em navegador PC/celular verifica o formulário do Administrador e o texto de simulação exibido no carrinho; conferir seu resultado no SHA correspondente antes de declarar aprovação visual. PR #1 permanece DRAFT, sem merge e sem deploy.
