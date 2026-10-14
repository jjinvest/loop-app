# LOOP — visao economica e fronteiras operacionais (premissas de projeto)

> Documento de alinhamento das explicacoes do idealizador em 14/10/2026.
> NAO e parecer juridico, prova de lucro, autorizacao de pagamento, regra
> financeira aprovada ou promessa comercial validada. Nenhum dinheiro real
> deve ser movimentado por este documento.

## 1. Complexo na logica, leve na operacao

O LOOP concentra vitrine, cadastro comercial, integracoes, exibicao do
andamento de pedidos, filas/tabuleiro e registro financeiro. A maior
parte da operacao fisica de mercadorias e delegada a distribuidores e
plataformas conveniadas, via integracoes autorizadas.

- LOOP: vitrine, experiencia do cliente, fluxo comercial autorizado,
  historico e exibicao dos status recebidos; atendimento e obrigacoes
  legais decorrentes da venda quando cabiveis.
- Parceiros: estoque, separacao, embalagem, frete, transportadora,
  despacho e entrega. O LOOP nao administra essas tarefas fisicas.
- A divisao operacional reduz atividades internas, mas NAO elimina
  responsabilidades contratuais, de consumidor, LGPD, contabeis,
  tributarias nem custo de suporte e integracoes.

## Complemento de 14/10/2026: LOOP como intermediador, sem estoque

O idealizador esclareceu que o LOOP pretende **expor mercadorias
de distribuidores, levar o cliente ao produto e fazer a ponte**
entre os participantes e a loja parceira. Nao pretende comprar
estoque nem recolher tributos ou contratar frete como dono da
mercadoria. Os custos de aquisicao de mercadorias, armazenagem,
despacho e logistica comercial pertencem, em principio, ao
distribuidor, conforme os contratos que forem efetivamente
firmados. No modelo pretendido, o LOOP tambem nao realiza
o recolhimento dos tributos da venda efetuada pelo parceiro.

Isso **nao torna a atividade do LOOP livre de tributos e custos**.
A remuneracao por indicacao/intermediacao, eventual margem ou
receita de plataforma pode ser tributavel, segundo enquadramento
fiscal e responsabilidades contratuais. Nao supor isencao
porque o distribuidor ja pagou tributos da propria atividade.

Distinguir duas modalidades, ainda NAO resolvidas:
1. **Indicacao/intermediacao:** parceiro e o vendedor e recebe
   o pagamento do cliente. O LOOP recebe comissao ou remuneracao
   contratada. Nesse modelo, o preco total da mercadoria **nao
   e automaticamente receita do LOOP**, e nao se pode alocar
   livremente R$100 de cada venda a fila sem que exista fonte
   real, contrato, recebimento e autorizacao juridica.
2. **Checkout no LOOP ou pagamento repartido:** se o LOOP
   vende em nome proprio ou participa dos recebimentos/repasse,
   podem surgir tributos, despesas do intermediador de pagamento,
   obrigacoes de plataforma e riscos de devolucoes e chargeback.
   Depende de quem figura como vendedor, emite nota, recebe e
   liquida o valor da transacao. Pode ser um modelo distinto
   de mera indicacao, mesmo sem estoque proprio.

O simulador economico atual usa preco total da mercadoria como
receita bruta do cenario e custo do fornecedor como despesa.
**Esta e uma hipotese de revenda/recebimento integral, NAO
o fluxo de intermediação puro pretendido como referencia.**
Os campos de custos podem ser zero conforme o contrato, mas
zerar custos por si so NAO transforma receita bruta da mercadoria
em comissao efetiva. Antes de calcular margens, definir
o fluxo financeiro e o papel do LOOP, sem presumir que
"dinheiro que passou pela plataforma" e lucro ou receita sua.

Bases de pesquisa para contador/advogado:
- Receita Federal, Solucao de Consulta COSIT 16/2020:
  intermediacao em nome alheio versus prestacao em nome proprio.
- Banco Central, FAQ de liquidacao centralizada: marketplace
  comercial versus marketplace com atividade de subcredenciamento.
- Receita Federal, orientacoes da Reforma Tributaria 2026.

## 2. Venda, fila e ciclo — modelo informado

- Cada venda valida e confirmada de produto gera exatamente uma
  posicao na fila, independentemente do preco comercial. Nenhum clique,
  evento logistico ou mera reserva de produto cria posicao.
- O idealizador descreve uma parcela interna de R$ 100 associada a
  cada venda, destinada ao funcionamento da dinamica de filas.
  Esta alocacao e interna ao preco da compra, NAO constitui
  automaticamente um produto ou taxa independente e nao afasta
  direitos de cancelamento, reembolso e devolucao integral.
- O tabuleiro possui um centro e cinco vagas. Um participante ocupa
  o centro de cada vez; seu ciclo e contabilizado em cinco eventos
  de vendas, com a seguinte ordem PRETENDIDA para os R$ 100 de
  referencia de cada evento:
    1. R$ 100 — participante do centro
    2. R$ 100 — empresa
    3. R$ 100 — participante do centro
    4. R$ 100 — empresa
    5. R$ 100 — participante do centro
- A distribuicao teorica dos cinco eventos e:
  R$ 500 em parcelas internas = R$ 300 ao participante do centro
  e R$ 200 alocados a empresa/caixa. **R$ 200 nao e lucro liquido
  nem saldo livre comprovado.** A divisao de valores nao esta
  implementada em pagamentos reais e depende de validacao juridica.
- A proposta de exibir cada recebimento ao participante no escritorio
  virtual e permitir saque esta sujeita a validacao de efetiva
  disponibilidade, liquidacao do pagamento, direitos de consumidores,
  encargos e garantias; eventos em simulacao nao criam credito real.

## 3. Duas linhas economicas separadas

A. **Dinamica das posicoes**: a proposta usa parcela de R$ 100
por venda e cinco eventos por ciclo. O usuario descreve duas parcelas
por ciclo destinadas a empresa/reserva e tres destinadas ao centro.

B. **Margem comercial sobre mercadorias**: precos de produtos podem
ser diferentes (ex.: R$ 250, R$ 300, R$ 500). Depois de contabilizar
a parcela interna de referencia, os custos do distribuidor,
tributos, intermediacao, frete quando aplicavel, devolucoes e
demais despesas, PODERA existir margem economica adicional.

Nao presumir que toda diferenca de preco e lucro, que toda venda esta
liquidada ou que valores sujeitos a estorno podem financiar saques
irrevogaveis. Uma eventual parte da margem para reserva ou apoio a
obrigacoes precisa de regras, conciliacao e demonstracao contabil.

## 4. Travas mencionadas pelo idealizador (hipoteses, NAO aprovadas)

- Utilizar uma das parcelas da empresa como caixa/reserva para
  proteger a liquidez e avaliar investimentos e outras destinacoes.
- Manter a segunda parcela em planejamento separado ate definir
  reserva, remuneracao da empresa e respectivas condicoes.
- Ajustar regras operacionais progressivamente, com versoes
  e trilha de auditoria sem mudar direitos ja constituidos.
- Considerar posicoes da propria empresa para ajustes no fluxo.
  ATENCAO: posicao criada sem venda efetiva NAO traz caixa novo e
  pode consumir capacidade de giro, gerar obrigacoes ficticias,
  distorcer filas e contrariar expectativas/contratos.
  Nao implementar automaticamente sem simulacoes, transparencia
  e parecer juridico especifico.
- Considerar margem comercial liquida complementar se demonstrada.
- Objetivo declarado: administrar filas grandes (5 mil, 10 mil
  ou mais posicoes) sem interromper a atividade e preservando
  os compromissos comerciais LICITOS.

## 5. Saques e taxas — pontos mencionados, ainda ambiguos

Foram mencionados um desconto de 3% no saque e possiveis minimos
diferentes por tipo de saldo. A explicacao mais recente faz
referencia a um minimo de R$ 100 para um saldo ligado a
"porcentagem" e a outro saldo com saque de pequenos valores
(ex.: R$ 6), sem minimo. O idealizador tambem cogitou e retirou
a ideia de um minimo de R$ 300.

**Nao transformar em configuracao fixa sem esclarecer**:
- Quantos saldos/carteiras existem e seus nomes exatos.
- Qual tipo de saldo teria minimo de R$ 100 e qual nao teria.
- Se a taxa de 3% incidira em ambos os saques, apenas um,
  ou se e apenas proposta; quem a cobra e se ha custos adicionais.
- Se valores do centro podem ser liberados por parcelas de
  R$ 100 ou somente apos conclusao das cinco vendas.
- Disponibilidade efetiva, processamento, estornos, tributacao,
  antifraude, compliance e autorizacao legal para guardar,
  repassar ou custodiar valores.
Nenhum saque real deve ser ativado antes dessas definicoes
e de avaliacao juridica/regulatoria.

## 6. Testes criticos de sustentabilidade e legalidade

**Alocacao contabil nao prova lucro nem sustentabilidade.**

Se cada venda gera UMA nova posicao e CINCO vendas sao exigidas
para concluir UM ciclo no centro, um conjunto de cinco vendas
pode criar cinco novos candidatos enquanto apenas um ciclo e
concluido. Sem mecanismo demonstrado para eliminar essa
diferenca, o numero de posicoes pendentes tende a crescer
mesmo quando a empresa mantem reserva em dinheiro.

Exemplo exclusivamente aritmetico: para concluir 10.000 ciclos,
a regra de cinco vendas por ciclo exigiria 50.000 eventos de venda
associados a ciclos, os quais tambem poderiam gerar 50.000
novas posicoes. Isso nao significa que os ciclos possam ser
prometidos a todos em prazo previsivel.

Obrigatorio ANTES de afirmar lucro garantido ou contemplacao
garantida:
- Projecoes e simulacoes com entradas em queda, constantes
  e crescentes; tempo de espera e backlog por coortes.
- Fluxo de caixa temporal: valor bruto, custos de fornecedor,
  impostos, taxas de pagamento, comissoes, reservas,
  recebiveis nao liquidados, perdas e reembolsos.
- Cenarios com 5 mil/10 mil posicoes, paralisacao de novas
  vendas, chargebacks, insolvencia de parceiro, entregas
  atrasadas e cancelamentos.
- Separacao entre passivos com clientes, caixa da empresa,
  receita comercial, reservas e eventuais creditos
  condicionais ou disputados.
- Parecer juridico brasileiro sobre direitos do consumidor,
  atividades financeiras e risco de piramide/esquema de
  remuneracao dependente de novas entradas, inclusive
  quando ha venda de produtos reais.

O sistema nao deve anunciar lucro garantido, prazo certo ou
saque incondicional com base nessas premissas.

## Primeira ferramenta de simulacao matematica

Foi criado um modulo offline de laboratorio em
`src/domain/projecao-sustentabilidade-loop.js`, testado em
`test/projecao-sustentabilidade-loop.test.js`, com relatorio
`npm run simular:sustentabilidade`.

Ele separa contribuicao comercial apos custos e parcela de
referencia das filas, eventos do centro/empresa e crescimento
das posicoes pendentes. Simula vendas constantes, decrescentes,
paradas, precos e custos variados, e estornos ocorridos antes
da geracao de posicao. **Nao** simula estorno tardio, receita
efetivamente liquidada, taxa/minimo de saque, custos fixos,
indicacoes e criterios juridicos de distribuicao.

O teste evidencia que, numa fila com 10 mil posicoes
preexistentes, 100 vendas adicionais gerariam 100 posicoes
novas e 20 ciclos concluidos, mantendo 10.080 pendentes
sob essas premissas. Este resultado nao representa a
ordem real de atendimento nem torna qualquer beneficio
prometido seguro. Ver `docs/SIMULADOR_SUSTENTABILIDADE.md`.

## 7. Regra de engenharia

Manter modulos separados para produtos e integracoes,
pedidos/logistica, motor de filas/tabuleiro e EVENTUAL
razao financeiro auditavel. Nenhuma integracao de frete
realiza creditos financeiros so porque um status chegou;
nenhum pagamento ou saque deve ser acionado por uma tela
de simulacao.

Este documento registra o modelo PRETENDIDO, seus pressupostos,
ambiguidades e testes pendentes para que nao sejam esquecidos
enquanto a plataforma segue em desenvolvimento experimental.
