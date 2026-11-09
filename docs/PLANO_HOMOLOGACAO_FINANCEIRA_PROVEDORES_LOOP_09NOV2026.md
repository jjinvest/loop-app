# LOOP 3.0 / AKITEMM — Plano de homologação financeira por instituição
Data: 09/11/2026. Referência operacional para continuidade do HUB.
Estado: **código interno de ensaio validado; homologação externa não iniciada/concluída**.

## Fluxo aprovado e não negociável
Pedido da loja -> PSP captador -> liquidação comprovada -> repasse autorizado -> custodiante LOOP Inter / conta comercial Mercado Pago / banco terceiro dos cofres -> abastecimento de executor Pix quando necessário -> Pix autorizado e conciliado. Motor, posições, filas e catraca têm autorização independente e não podem ser ativados só por avisos de PSP ou cor. Cenários de erro não podem disparar segunda transferência automática. Direito de participante nunca é criado a partir de um extrato demonstrativo.

## Contratos e conexões que dependem de aprovação externa
| Papel | Instituição candidata | Validação técnica e comercial exigida |
| --- | --- | --- |
| Receber e liquidar | Celcoin ou Asaas | CNPJ e KYC ativo, contrato, cobrança Pix/cartão, tarifa e vencimentos, callback idempotente, chave por ambiente |
| Distribuir | PSP contratado | Provar destino externo; **split Asaas carteira interna não é Inter/MP**, split Celcoin BaaS é específico de contas internas |
| Custodiar LOOP | Banco Inter | Conta da empresa, certificado, escopo API Banking, consulta autenticada de saldo e extrato, transferência externa e titularidade |
| Custodiar loja | Mercado Pago | Conta comercial aprovada, relatório de dinheiro em conta completo, geração/consulta/download de arquivo, comparação por ID nativo |
| Cofres | Terceiro banco a escolher | Regras de reserva/douradas e comprovantes de contas/subcontas separadas; evitar considerar promessas como saldo |
| Executar saques | Asaas ou Pix-out aprovado | Contrato Pix-out, conta com saldo real, eventual prefunding Inter -> pagador, extrato e comprovante de crédito, estornos |

## Sequência de homologação
1. Conferir CNPJ ativo, documentação da empresa, modelo de negócio integral, beneficiário e políticas aplicáveis com cada instituição; não ocultar obrigação de participação/recompensa do PSP/compliance quando for material para a análise.
2. Abrir ambiente de sandbox próprio por PSP e executor e validar escopos mínimos de cada chave/certificado; nunca subir chaves no GitHub ou logs.
3. Consultar identidade da conta: documento de titularidade e número/identificador de conta retornados por canal autenticado do provedor, comparados a cadastro empresarial aprovado. Registro local HMAC declaratório não conta como prova bancária.
4. Realizar compra fictícia, verificar cobrança, estado definitivo e estorno; capturar identificador nativo e exigir conciliação com extrato de provedor e do custodiante.
5. Homologar distribuição **externa** real em transações controladas só após autorizações: saldo inicial, transferência, tarifa e crédito separado no Inter/MP/terceiro banco. Se o split só funciona para carteiras internas, tratá-lo como serviço de ledger interno e usar transferências bancárias contratadas.
6. Homologar retenções de fornecedor/tributos e cofres com documentos fiscais e proibição de sacar montante reservado.
7. Homologar saque de valor mínimo conforme política com chave Pix, reserva e autorização; se o executor não custodiar o dinheiro, provar abastecimento da sua conta e identificação da transferência antes de liberar Pix.
8. Testar timeout em cada etapa, callback duplicado, erro 5xx, queda do worker, requisições concorrentes, reenvio de webhook, saldo insuficiente, estorno tardio e banco alternativo; estados indeterminados sempre aguardam consulta e conciliação.
9. Validar isolamento de contas de clientes, controle administrativo, HMAC/segredos offsite, backup cifrado restaurado, logs e relatórios fiscais, limites/horários, checklist de mudança e rollback.
10. Executar inspeção independente e registrar comprovantes/revisões no HUB/GitHub **sem segredos ou PII**; só solicitar go-live após contratos, segurança, jurídico, conciliação real e aceite formal.

## Evidências exigidas por operação real
Nenhum campo booleano preenchido por input do cliente substitui uma evidência de API autenticada. Cada operação deve conter: ID pedido/operacao, ID nativo PSP, banco custodiante e titular, origem da consulta autenticada, lote/ID de transação, moeda/valor/efeitos de tarifa, horários efetivos, estado da reversão, versão do plano e referências imutáveis. Reversões devem manter a referência anterior, sem apagar movimentos ou reenviar Pix em outra API.

## Critério de conclusão
O bloco **sem CNPJ/chaves** está tecnicamente concluído quando a suite de ensaio é verde e os relatórios indicam dinheiro real bloqueado. A infraestrutura **não está homologada** até que os 14 gates de `src/producao/prontidao-financeira-ensaio.js` sejam substituídos por provas externas independentes e auditadas em um gate real novo, com liberação explícita. Nunca converter flags de laboratório em autorização de produção. Painéis/telas originais devem ser preservados.

Fontes técnicas: [Asaas API](https://docs.asaas.com/reference/recuperar-extrato), [Celcoin Split Pix](https://developers.celcoin.com.br/docs/split-pix), [Banco Inter APIs](https://developers.inter.co/docs/introducao/nossas-apis), [Mercado Pago Relatórios](https://www.mercadopago.com.br/developers/pt/reference/reports/overview).

## Situação de branch
Desenvolvimento em `feature/unificar-escritorio-real-20261105`. PR #1 DRAFT continua aberta sobre `fix/teste-escrita-catraca-20261014`; logo o avanço desta branch **não consta automaticamente da PR #1**. Sem merge/deploy/pagamento real.