# LOOP 3.0 / AKITEMM — Controle de requisitos para ativação

04/11/2026 · Seção 201. Continuação integrada da seção 200, sem reiniciar decisões.

## Entrega técnica
O módulo `src/domain/diagnostico-ativacao-candidato.js` centraliza a leitura dos bloqueios antes da transição de pré-adesão para o motor definitivo. Ele reutiliza o **mesmo SQLite** da loja, da fotografia histórica do pedido, da conciliação Asaas Sandbox e da custódia criptografada de CPF/termos. Não cria posições nem executa comandos financeiros.

O diagnóstico, por pré-pedido e titular, devolve informações separadas sobre: pré-adesão persistida e sem revisão, CPF fictício declarado, termos da versão vigente, fotografia histórica, pagamento reconsultado no Sandbox, **verificação externa real de identidade**, confirmação de pagamento comercial, capacidade de até 10 posições ativas por titular, limite de duas posições por tabuleiro, integridade do motor/financeiro e autorização operacional final. **Os requisitos que ainda não possuem homologação real permanecem bloqueados**, em vez de serem inferidos pela presença de dados fictícios.

As rotas `GET /staging/escritorio-unificado/diagnostico-ativacao/:id` (operador) e `GET /staging/meu-diagnostico-ativacao/:id` (somente titular da sessão) aplicam controle de acesso. Leituras não geram ordens de fila e não fazem consulta de rede para simular a verificação externa.

No Escritório do Cliente, cada pedido agora tem **Ver requisitos de ativação**. No Administrador, o ID já selecionado na conferência de pré-adesão também serve ao botão **Conferir requisitos de ativação** e à ação **Abrir missão de regularização**. A missão é vinculada ao pré-pedido, registrada em `SEGURANCA`, com chave idempotente estável por pedido; reenvios não criam outra missão e o acompanhamento permanece no histórico de tarefas existente. Não exige copiar ID nem cria nova base paralela.

## Garantias e limites
- Falha fechada sem verificação externa de identidade; declaração ou checksum de CPF não é KYC.
- Um Pix de ensaio não é pagamento comercial.
- O limite de 10 posições e o de duas vagas por titular no tabuleiro não são tratados como validados até serem aferidos no estado **persistido definitivo** do motor.
- O diagnóstico não oferece `POST /ativar`, não atualiza a pré-adesão e retorna `permitidoAtivar=false`, `permitidoMoverFila=false`, `permitidoGirar=false` e `permitidoPagar=false`.
- Exposição de dados pessoais: não retorna CPF completo, hash ou segredo; cliente não acessa pedidos de outra conta.
- Não há prestador KYC externo nem contrato de homologação comercial de pagamentos configurado nesta etapa. A próxima ligação exige selecionar o provedor, implementar o fluxo consentido e a verificação independente, e validar autorizações, limites e auditoria jurídica/financeira antes de qualquer operação definitiva.

## Testes e evidências
Novos testes de domínio e integração verificam bloqueios com ou sem pré-adesão, reversão de PSP, impossibilidade de ampliar permissões, separação de titulares, resposta de Admin/Cliente, missão operacional idempotente e ausência dessas rotas no servidor público. O roteiro de navegador PC/celular verifica botões em ambos os escritórios. Conferir o CI do SHA correspondente; não declarar aprovado enquanto estiver pendente.

### Execuções de CI associadas ao código
- [Segurança, integração e bloqueio de produção](https://github.com/jjinvest/loop-app/actions/runs/41862522755) — status **queued** consultado em 04/11/2026, ainda sem conclusão.
- [Navegador PC/celular e missão idempotente no Admin](https://github.com/jjinvest/loop-app/actions/runs/41862598132) — status **queued** consultado em 04/11/2026, ainda sem conclusão.
- Verificação sintática de todos os arquivos JS alterados realizada; não substitui execução de testes Node/Playwright.
