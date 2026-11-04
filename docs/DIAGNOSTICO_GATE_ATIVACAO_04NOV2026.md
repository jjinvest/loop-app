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
- [Segurança, integração e bloqueio de produção](https://github.com/jjinvest/loop-app/actions/runs/41862522755) — **SUCCESS** confirmado em 04/11/2026 (SHA `507be314dd1f23158054c61003d1c2c49d05a962`).
- [Navegador PC/celular e missão idempotente no Admin](https://github.com/jjinvest/loop-app/actions/runs/41862598132) — **SUCCESS** confirmado em 04/11/2026 (SHA `81cacd1761ab612f854c6ee3b69bca0cce126a54`).
- Verificação sintática de todos os arquivos JS alterados realizada; não substitui execução de testes Node/Playwright.

### Endurecimento posterior — seção 202
O diagnóstico agora rejeita como `FONTE_DIAGNOSTICO_INCONSISTENTE` qualquer resposta da fonte com pedido ou titular divergentes do filtro da requisição, ou vetor de motivos inválido. Uma fonte adulterada não pode resultar em indicadores de aptidão de outro comprador. Novo teste negativo também demonstra que até um provedor KYC **Sandbox** que devolvesse "aprovado" não libera motor, pagamento ou direitos reais. A verificação independente de KYC externo comercial permanece inexistente. Ver [registro 202](./BLINDAGEM_FONTE_GATE_ATIVACAO_04NOV2026.md).

### Seção 203 — comprovação de e-mail integrada ao diagnóstico
O gate agora lê o estado `emailVerificado` diretamente da mesma `ContaUnicaCandidataSQLite` usada em cadastro/login/Escritórios, com a fonte original da comprovação persistida em SQLite. O status de **código enviado** não conta como e-mail confirmado. Sem prova de posse, apresenta `EMAIL_DA_CONTA_NAO_VERIFICADO` tanto no Cliente quanto no Administrador; após prova válida, apenas essa pendência desaparece. KYC externo, pagamento comercial, capacidade de 10/2 no motor definitivo e autorização continuam bloqueados. Ausência/inconsistência de titular no diagnóstico falha fechada. [Registro 203](./EMAIL_COMPROVADO_NO_GATE_ATIVACAO_04NOV2026.md).
