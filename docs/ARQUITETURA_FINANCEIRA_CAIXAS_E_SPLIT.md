# LOOP — arquitetura financeira: caixas internos e repasse a distribuidores

> Alinhamento de arquitetura em 15/10/2026. A separacao entre LOOP e
> operacao comercial de dropshipping foi reforcada pelo idealizador.
> Este texto NAO ativa recebimento, repasse, saldo de cliente, saque
> nem determina regras legais ou contabeis definitivas.

## Dois conjuntos de controles — nao apenas tres caixas no total

**Operacao comercial (dropshipping):**
- Parcela/obrigacao com o **distribuidor**, que fornece e despacha
  a mercadoria. O idealizador quer que o pagamento ao distribuidor
  seja separado automaticamente, quando o meio de pagamento
  e o contrato com esse parceiro permitirem.
- Parcela comercial propria do LOOP/loja, que continua sujeita
  a impostos, taxas, custos, estornos e demais obrigacoes.

**Dinâmica interna do LOOP:** tres caixas com posicoes fixas,
ja confirmadas pelo idealizador:
1. ESQUERDA — investimentos.
2. CENTRO — valores destinados a participacao de lucros dos clientes.
3. DIREITA — suporte a todo o empreendimento LOOP.

Nomes de exibicao e cores sao configuracoes EDITAVEIS futuras
no Escritorio Administrativo. Edicao visual NAO modifica direitos,
destinatarios, saldo ou regra de distribuicao. Saldos, historico
completo e parametros sao restritos ao administrador.

A operacao comercial e a dinamica do LOOP precisam ser
identificadas separadamente, mas integradas por registros
auditaveis da mesma venda. Nao confundir o caixa da loja com
os tres caixas da dinamica interna, nem com saldos individuais
de participantes.

## Conta bancária x livro de saldos interno x split de pagamento

Ha tres solucoes possiveis; podem coexistir:

**A. Uma conta financeira da empresa + razao interno segregado:**
um unico saldo real pode sustentar multiplos centros de
custos e obrigacoes *contabilizados separadamente* no
sistema. Isso NAO coloca o dinheiro em contas
bancarias realmente distintas, NAO o protege
automaticamente de outras saidas, e NAO cria
custodia fiduciaria legal. Nenhum saldo interno
deve ser anunciado como dinheiro depositado em
conta bancaria individual de cliente.

**B. Contas bancarias distintas:** a empresa pode
manter mais de uma conta real, com transferencias
devidamente conciliadas. Opcional, mais oneroso
de operar e geralmente desnecessario para
simples visualizacao por caixas.

**C. Split de pagamento de um PSP autorizado:**
o provedor de pagamentos pode, quando for
compativel com a operacao e contrato,
atribuir automaticamente parcelas
do pagamento a recebedores diferentes.
O distribuidor deve estar cadastrado/
habilitado como recebedor ou conta
vinculada, conforme as condicoes do PSP.
Se o parceiro nao puder receber por split,
o LOOP pode registrar contas a pagar
e realizar repasse pela integracao
aprovada em etapa posterior.
Diferentes recebedores NAO implicam
abrir uma conta bancaria para
cada caixa de exibicao interno do LOOP.

**Proposta tecnica preferida, AINDA NAO APROVADA PARA ATIVACAO:**
controle contábil interno granular para
todas as finalidades + split real somente
para recebedores externos elegiveis (como
o distribuidor), depois de validar
custos, KYC e contrato. Os caixas
internos do LOOP sao categorias contabeis
editaveis em nome/cor, nao contas bancarias
automaticamente criadas.

## Exemplo apenas ilustrativo da reconciliação

Venda de produto fisico: **R$ 600**.
- Custo de fornecimento hipotetico: **R$ 300**.
- Parcela de referencia do LOOP segundo
  premissas anteriores: **R$ 100**.
- Diferenca comercial bruta hipotetica:
  **R$ 200 ANTES de taxas de pagamento,
  impostos, reembolsos e demais custos**.

Se houver split para o distribuidor,
o provedor pode alocar a parcela contratada
ao distribuidor e disponibilizar o
restante para a empresa, de acordo com
as taxas, regras e cronograma pactuados.
Caso contrario, a empresa registra
a obrigacao de pagar o distribuidor
e a liquida na forma combinada.
Em ambos os casos, o sistema deve
mostrar claramente **valor bruto,
custo do fornecedor, tarifas,
valor liquidado e passivos pendentes**.

Os R$ 100 de referencia destinados a
dinamica do LOOP nao especificam, por
si so, quanto do dinheiro deve entrar
em cada um dos tres caixas internos.
**Nao inferir uma nova distribuicao**.
As regras de ciclo ja discutidas devem
ser preservadas e conciliadas antes
de ativar qualquer lancamento.

## Isolamento e seguranca do projeto

- Movimentacoes reais so mediante
  comprovacao autenticada de PSP,
  registros idempotentes e conciliacao;
  jamais por cliques ficticios.
- Registro distinto de
  `receita comercial`,
  `contas a pagar distribuidor`,
  `tarifas e impostos`,
  `parcelas reservadas`,
  `passivos de participantes` e
  `saldo efetivamente disponivel`.
- Prever estorno, chargeback, entrega
  nao realizada, insuficiencia de
  saldo, falha no repasse e
  conciliacao entre PSP e razao.
- Nao criar custodia de recursos
  de terceiros ou saques de
  participantes por conta propria
  sem revisao juridica e parceiro
  financeiro adequado.
- As cores, nomes e a posicao visual
  dos caixas nunca autorizam ou
  executam movimentos financeiros.
- A loja LOOP continua sendo
  a vendedora perante o cliente,
  conforme as premissas anteriores.

## Decisoes futuras, sob comando do idealizador

- Escolha do PSP e se o fornecedor
  aceitara registro como recebedor.
- Tipo de conta(s) bancarias
  corporativas e cronograma de repasse.
- Politica exata de atribuicao de
  parcelas e regras de estorno.
- Permissoes de operacao real,
  reconciliacao contábil e auditoria.

Implementar inicialmente como estrutura
de **dados e telas ficticias**, sem
credenciais financeiras nem dinheiro real.

Fontes tecnicas para avaliacao futura:
- Pagar.me — https://docs.pagar.me/docs/pedidos-com-split
- Asaas — https://docs.asaas.com/docs/split-de-pagamentos
- Mercado Pago — https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites

Documentos preservados:
- `docs/DIRETRIZES_ESCRITORIOS_E_CAIXAS.md`
- `docs/PREMISSAS_FINANCEIRAS_E_RISCOS.md`
- `docs/ARQUITETURA_MODULAR.md`
