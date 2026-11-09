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


## Implementação do primeiro bloco técnico — 09/11/2026

A versão da branch `feature/unificar-escritorio-real-20261105` já contém o código `src/producao/portas-financeiras-modulares.js`. Estabelece **seis portas lógicas**, agrupadas em três responsabilidades independentes: captação e distribuição por PSP, custódia em contas bancárias e execução Pix de saques. Contratos internos exigem métodos padronizados, porém cada instituição precisará de seu próprio adaptador HTTP, tratamento de autenticação, prazos, webhooks, estornos e liquidação — **não são equivalentes**.

A seleção inicial mantém **Celcoin e Asaas como candidatos, sem homologação presumida**. Inter é banco de custódia LOOP *proposto*, Mercado Pago é conta comercial *proposta*, banco de cofres ainda não escolhido e executor de saques não contratado (Asaas é candidato). A escolha pode ser planejada para cada papel separadamente, e o planner incrementa revisão sem sobrescrever o plano antigo, preservando a obrigação de conciliar origem, comprovar saldo no destino e contratar novas credenciais. A existência de operações financeiras em aberto ou indeterminadas classifica a substituição como bloqueada. Na contingência, operações enviadas/indeterminadas **não** são reenviadas a outro executor automaticamente. Não há saques ativados, nem APIs externas reais expostas.

O modelo real de custos da homologação `src/domain/plano-roteamento-tres-bancos-lab.js` agora recebe opcionalmente o plano versionado, permitindo projetar destinos bancários alternativos sem mudar o cálculo da referência LOOP, margem, custo fornecedor e cofres, sem mexer nos painéis já aprovados. Identificador `LOOP_INTER` é alias legado lógico, **não** significa que o banco real está conectado nem é imutável. Testes do plano padrão e da troca simularam Inter -> outro banco -> Inter, Celcoin recebedor/distribuidor + Asaas executor, seis portas, erros de capacidade, operações indeterminadas e Pix bloqueado. Integrações reais e transações continuarão fechadas até homologação.

**Diferenças verificadas em documentação pública de fornecedores:** split Asaas destina valores às carteiras Asaas via `walletId`; split Pix Celcoin BaaS (modalidade QR dinâmico) destina às contas internas BaaS. Não confundir nenhum dos dois com distribuição automática a Inter ou Mercado Pago: repasse externo é outro recurso, com contrato, saldo, APIs e conciliação próprios. Fonte: https://central.ajuda.asaas.com/hc/pt-br/articles/32108845619739-O-que-%C3%A9-o-Split-de-Pagamentos e https://developers.celcoin.com.br/docs/split-pix . Pix-out de saldos na Asaas requer saldo da conta de origem da própria Asaas (https://docs.asaas.com/docs/transferencia-para-contas-de-outra-instituicao-pix-ted); se a custódia é no Inter, abastecimento em conta Asaas real antecede pagamento, e sandbox não recebe Pix real.
