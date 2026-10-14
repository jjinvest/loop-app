# LOOP — Simulador de sustentabilidade economica e crescimento das filas

> **APENAS LABORATORIO / CENARIOS FICTICIOS.** Esta ferramenta nao
> comprova rentabilidade, sustentabilidade, viabilidade juridica,
> capacidade de liquidar saques nem legitimidade de contemplacoes.
> Nao usa dados de clientes e nao movimenta dinheiro ou filas reais.

## Modelo comercial confirmado: vendedor em dropshipping

No modelo pretendido pelo idealizador, o LOOP e
**a loja vendedora**. O checkout recebe o pagamento
do cliente no LOOP; a loja registra o custo contratado
e repassa ao distribuidor a quantia devida para atender
a venda. Estoque, transporte e entrega sao
operacoes do fornecedor, mas **o custo do produto
precisa constar no calculo da loja**.

Exemplos ilustrativos:
- Venda R$250, fornecedor R$50, referencia fila R$100:
  sobra comercial BRUTA R$100 antes dos demais custos.
- Venda R$600, fornecedor R$300, referencia fila R$100:
  sobra comercial BRUTA R$200 antes dos demais custos.

O simulador existente usa o custo do fornecedor,
alocacao da fila e custos opcionais exemplificativos.
Assim, seu formato de recebimento integral com repasse
ao fornecedor e compativel com o dropshipping pretendido,
mas **ainda nao modela** obrigacoes tributarias reais,
liquidacao da operadora, devolucoes tardias ou
compromissos de recebiveis em datas distintas.
Zerar um custo em teste significa que ele nao
foi modelado, NAO que a empresa tenha isencao.

## Objetivo

A ideia de uma empresa enxuta pela terceirizacao da logistica e
distinta da pergunta financeira: **quanto custa vender cada produto,
que parcela e destinada ao fluxo de filas e quantas posicoes continuam
aguardando depois dos ciclos?**

O modulo `src/domain/projecao-sustentabilidade-loop.js` analisa as
duas dimensoes em paralelo, evitando a duplicacao de receitas.

## Como executar

Em ambiente de desenvolvimento com Node.js 22+ e o repositorio:

```sh
npm run simular:sustentabilidade
```

O comando apenas imprime cenarios ficticios. Nao se conecta a gateway,
banco de clientes, API de distribuidor, tabuleiro nem carteira.

Para novos cenarios de laboratorio, importar a funcao:

```js
const { projetarSustentabilidade } =
  require('./src/domain/projecao-sustentabilidade-loop');

const resultado = projetarSustentabilidade({
  posicoesIniciais: 10000,
  periodos: [{
    rotulo: 'Mes ilustrativo',
    vendasValidas: 100,
    vendasReembolsadas: 0,
    precoCentavos: 25000,
    custoFornecedorCentavos: 9000,
    impostosCentavos: 2000,
    tarifaPagamentoCentavos: 800,
    despesaOperacionalCentavos: 700,
    custoEstornoNaoRecuperavelCentavos: 2500
  }]
});
```

Todos os valores financeiros sao em **centavos inteiros**. Os custos,
margens e precos sao **exemplos inventados**, nao valores praticados ou
estimativas baseadas na franquia. O sistema recusa dados ausentes,
invalidos e resultados numericos que excedam inteiro seguro.

## Separacao de valores, sem contar o mesmo dinheiro duas vezes

No exemplo de 100 vendas validas a R$ 250 cada:

| Destino / grandeza | Valor ilustrativo |
| --- | ---: |
| Receita bruta / liquida antes de estornos | R$ 25.000 |
| Custos por venda: fornecedor, impostos, taxas, despesas | R$ 12.500 |
| Contribuicao antes da parcela interna da fila | R$ 12.500 |
| Parcela de referencia para a fila: 100 x R$ 100 | R$ 10.000 |
| Margem comercial **residual hipotetica** apos reservar fila | R$ 2.500 |
| Dentro dos R$ 10 mil da fila: 20 ciclos x R$ 300 para o centro | R$ 6.000 |
| Dentro dos mesmos R$ 10 mil: 20 ciclos x R$ 200 para empresa/caixa | R$ 4.000 |

Os R$ 4 mil de parcela da empresa **JA SAO parte** dos R$ 10 mil
alocados a fila: nao sao uma segunda entrada de dinheiro. Os R$ 2.500
de margem comercial tambem NAO sao lucro liquido garantido, pois ha
custos e obrigacoes nao modelados. Os R$ 6 mil sao referencia de
distribuicao hipotetica, **nao dinheiro pago ou saldo liberado**.
Parcelas destinadas a empresa/caixa podem continuar comprometidas
por passivos, reembolsos, tributos ou necessidades de liquidez.

## Primeiro comecar pequeno, depois testar filas grandes

O comando `npm run simular:sustentabilidade` agora mostra
**primeiro um lancamento partindo de zero** e um cenario
partindo de dez posicoes ja registradas. As filas de 5 mil
e 10 mil aparecem apenas como **situacoes de estresse
futuras, depois de muitas compras e varios ciclos**, nao
como um ponto de partida real da empresa.

- Cada compra valida cria uma **posicao**, mesmo que
  seja a segunda, terceira ou quinta compra da mesma pessoa.
  O modulo **nao calcula participantes unicos**.
- `posicoesPendentes` e uma contagem de **todas as posicoes
  ainda ativas**, incluindo centro e ate cinco vagas,
  nao so aquelas aguardando nas filas A ou B.
- `posicoesNoTabuleiroEstimadas` indica ate seis posicoes
  no tabuleiro na hipotese agregada; e
  `posicoesAguardandoFilaEstimadas` indica o restante.
  Nao estima quem estara em A/B nem quem chegara ao centro.
- Se um participante contemplado compra novamente, a
  nova compra e nova posicao. A saida da posicao anterior
  so ocorre quando o ciclo respectivo e concluido.

Com **100 vendas desde o zero**, seis posicoes iniciam
o tabuleiro, restam 94 eventos contabilizados,
ocorrem 18 ciclos concluidos e ficam 82 posicoes ativas,
sendo aproximadamente 76 na fila e seis no tabuleiro.

Com **dez posicoes iniciais ja ativas**, mais 100 vendas
somam 110 posicoes criadas/anteriores. Vinte ciclos
concluidos deixam 90 posicoes ainda ativas, 84 na fila
e seis no tabuleiro. Esse e um exemplo de contagem,
nao uma previsao do tempo de cada cliente.

O tempo de espera afeta o momento de pagamento e o
fluxo de caixa, mas nao equivale a nova receita; uma
posicao criada sem compra efetiva nao gera recurso novo.

## Crescimento da fila

Premissas deliberadamente explicitas para este calculo agregado:

- Cada venda valida gera **uma posicao**.
- Para iniciar do zero, seis posicoes preenchem centro e cinco vagas.
  As vendas utilizadas para montar esse tabuleiro inicial nao sao
  contadas de novo como eventos do primeiro ciclo.
- Com o tabuleiro pronto, cinco novos eventos de venda concluem um
  ciclo, retirando apenas **uma posicao do centro**.
- A classificacao sequencial das cinco parcelas e: participante,
  empresa, participante, empresa, participante.
- O modelo supoe catraca sempre apta a girar; pausas e falta de
  outros requisitos so podem atrasar conclusoes.
- Nao simula indicacoes, prioridades A/B, a ordem das posicoes,
  datas reais de entrada ou promessa de prazo.

**Somente teste de estresse num instante futuro:** com 10 mil posicoes
ja ativas (incluindo seis do tabuleiro), mais 100 vendas geram
`10.000 + 100 - 20 = 10.080` posicoes ainda ativas, aproximadamente
10.074 aguardando na fila. Esse numero nao descreve o lancamento do LOOP.

Em outro **teste de estresse futuro** com 5 mil posicoes ja ativas,
100 vendas adicionais deixam 5.080 posicoes ativas, estimando 5.074
fora do tabuleiro.

Se a venda parar, a simulacao nao gera novos eventos de ciclo; a
fila nao diminui so porque existe reserva contabil. A existencia
de 5 mil/10 mil posicoes anteriores **nao cria dinheiro novo** e
seu historico financeiro anterior nao e representado no modelo.

A coluna `exposicaoTeoricaSeTodasAsPosicoesRecebessemCentroCentavos`
serve apenas para fazer um teste de escala (posicoes pendentes x R$300).
Ela NAO classifica automaticamente tais quantias como passivo legal,
divida vencida ou garantia de pagamento.

## Estornos e limitacoes

`vendasReembolsadas` representa pedidos integralmente reembolsados
**no mesmo periodo e antes de gerar uma posicao**. Sua receita
e cancelada na hipotese; `custoEstornoNaoRecuperavelCentavos` registra
custo/perda residual. O modelo NAO resolve estornos tardios de
compras que ja geraram posicoes ou eventos no tabuleiro. Isso
exigira regras de compensacao, consumidores, auditoria e autorizacao
juridica especifica.

O simulador **nao** calcula:
- repasse/saque real, taxa de saque de 3%, minimos ou valores creditados;
- saldo liquidado do gateway, capital de giro, rendimentos de investimento;
- custos fixos da empresa, equipe, marketing, suporte, perda por fraude;
- tributos definitivos, chargebacks tardios e frete nao cobrado;
- bonificacoes, prioridades de indicacao, efeitos de posicoes da
  propria empresa ou mudanca de regras com ciclos em andamento;
- risco de inadimplencia de fornecedor, financiamento e perdas futuras.

O resultado NUNCA deve servir de argumento de que lucro e garantido
ou de que todas as posicoes terao contemplacao. Os 3% de saque e os
minimos seguem pendentes de definicao, conforme
`docs/PREMISSAS_FINANCEIRAS_E_RISCOS.md`.

## Testes e proximas verificacoes

`test/projecao-sustentabilidade-loop.test.js` cobre inicio de
tabuleiro, ciclos parciais, R$ 300/R$ 200, 5 mil/10 mil posicoes,
vendas em queda/paradas, diferenca entre margem e alocacao, estornos,
valores invalidos e estouros numericos.

Proximos trabalhos recomendados: custo fixo, conciliacao de
recebiveis/saques simulados (sem pagamentos), analise por coortes,
estorno tardio, horizonte e indicadores de solvencia; revisao
independente com advogado e contador ANTES de qualquer operacao real.
