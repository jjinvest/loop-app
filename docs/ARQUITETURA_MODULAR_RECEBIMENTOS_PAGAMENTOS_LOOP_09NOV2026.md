# LOOP 3.0 / AKITEMM — Arquitetura modular de recebimentos e pagamentos
Definido pelo titular em 09/11/2026. STATUS: PLANO; instituições ainda não contratadas/homologadas.

## Decisão aprovada
Separar as responsabilidades para que uma falha isolada não paralise toda a empresa. Permitir trocar PSP e bancos sem alterar as telas, contas, históricos ou motor do LOOP.

1. RECEBEDOR/DISTRIBUIDOR DE VENDAS: Celcoin ou Asaas, ou outro PSP aprovado posteriormente, a escolher após verificação comercial. Recebe pagamentos AKITEMM Pix/cartão; consulta comprovantes, liquidação e estornos; quando contratado e permitido, repassa fundos a contas designadas. Não presumir split para bancos externos sem confirmação do produto contratado.
2. BANCOS DE CUSTÓDIA: Inter inicialmente para recursos do LOOP, Mercado Pago como conta da loja e terceiro banco para reservas/cofres; cadastrar 3-4 bancos habilitados e escolher por finalidade, com possibilidade de revezamento a cada seis meses ou contingência, sem reescrever o sistema. Cada movimentação exige titularidade, limites, reconciliação e autorização; rotação não serve para contornar restrições financeiras ou regulatórias.
3. PAGADOR DOS SAQUES: API Pix-out independente da Celcoin; Asaas candidato. O escritório solicita saque, verifica permissão e saldo disponível, reserva valor, envia à API e só confirma ao titular após comprovante e conciliação. Se Inter guarda o saldo e Asaas executa Pix, primeiro transferir recursos reais do Inter à conta Asaas real (prefunding), depois efetuar Pix; Asaas não debita o Inter diretamente. Outra API ou banco pode substituir o executor sem alterar o escritório.

FLUXO: Pedido AKITEMM -> PSP Recebedor -> confirmação e conciliação independente -> livro financeiro e regras de alocação -> bancos de custódia -> tesouraria autorizada -> executor Pix externo -> CPF do titular. Participações, filas, catraca e direitos remuneratórios ficam em subsistema separado, com seus próprios gates; nunca pagar com base só em uma cor, luz, saldo exibido ou aviso não verificado.

## Interfaces da implementação
RecebedorPSP: criar/consultar cobrança, receber webhook verificado, consultar liquidação, reconciliar valor e tarifa.
Distribuidor: alocar e transferir para bancos permitidos conforme saldos realmente disponíveis; conferir transferência.
BancoCustodia: conta vinculada, saldo/extrato, limites, consulta e transferência; banco ativo por finalidade e vigência.
ExecutorPixSaque: validar destino, preparar/consultar Pix, acompanhar comprovante, reconciliar estorno.
OrquestradorDeSaques: solicitação, elegibilidade, reserva, idempotência, aprovação e estados SOLICITADO -> RESERVADO -> ENVIADO -> CONFIRMADO; falha e incerteza mantêm bloqueio de reenvio.
Configurador/Contingencia: credenciais separadas, controle RBAC, rotação de banco a cada seis meses ou manual por incidente, registro de mudança imutável, dupla verificação e testes de restauração.

## Resiliência
PSP ou banco indisponível: usar alternativa somente se já contratada, com saldo, permissão, limites e segurança homologados. Pagamento em status INDETERMINADO não pode ser reenviado por segunda API sem reconciliação: evita saque duplo. Bloquear chaves comprometidas, preservar histórico de obrigações no banco anterior, fazer reconciliação e migrar apenas disponibilidades verificadas. Duas rotas não significam que duas instituições possam movimentar a mesma conta sem autorização. Fazer backups cifrados, monitoria, limitação por função e auditoria de saldo.

## Sandbox e dinheiro real
Sandbox opera com valores fictícios. Não se abastece sandbox com Pix verdadeiro do Inter. Quando a operação real for aprovada, pode ser preciso transferir saldo real do Inter para conta real Asaas; isso é diferente de testes sandbox.

## Pendências e critérios
Definir PSP recebedor: Celcoin vs Asaas, funcionalidades e limites contratuais reais, custos, Pix/cartão, split, prazos, KYC e acesso sandbox. Definir executor independente, contrato e necessidade de prefunding, bancos alternativos e rotas de contingência. Validar tratamento do fluxo efetivo, regras de transferência e requisitos jurídicos/compliance com parceiros, sem ocultação. Sem ativar saques/comissões e sem movimentações reais sem autorizações.

Frase de recuperação do usuário: "assuntos dos recebimentos e pagamentos" ou "como você montou o esqueleto?". Responder com síntese da arquitetura e decisões pendentes, sem enviar links de código ou testes.
