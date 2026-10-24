# LOOP V5 — Troca de referencia R$ 250 para R$ 500 (laboratorio)

Decisao de produto: **fila unica**, sem escolher planos ou criar fila
separada. A loja continua podendo vender em qualquer valor.
Somente compras confirmadas com total igual ou maior que a
**referencia vigente** geram UMA posicao na B, validam convites
e seguem o fluxo de prioridade e tabuleiro preexistentes.

## Marco de mudanca e compromissos historicos

A tabela `admin_valor_loop_versoes_demo` tem revisoes
append-only com:
- revisao sequencial;
- valor em centavos;
- data ISO UTC de inicio de vigencia registrada pelo servidor.

Valor inicial R$ 250,00. Um administrador local autenticado
pode editar o novo valor no painel `/admin/financeiro-demo`
(formulario "Valor de entrada no LOOP"). A API administrativa
`PATCH /api/admin/valor-loop-demo` aceita estritamente
`valorCentavos` e `revisaoEsperada`; conflito de revisao
rejeita gravações simultaneas.

Cada posicao gerada pela ponte recebe um registro imutavel em
`admin_ponte_posicoes_valores_demo` ligando pedido original,
revisao e valor de referencia. Reprocessamento/idempotencia
retorna **o valor original**. Bancos de laboratorio com
posicoes preexistentes usam o padrao historico R$250 ao
migrar sem modificar pedidos. O painel de conta individual
tambem inclui a referencia de cada posicao.

Exemplo: venda confirmada antes da mudanca R$250 -> posicao
com referencia R$250 (revisao 1). Depois do marco da
mudanca R$500, venda confirmada de R$250 ou R$300 e apenas
loja; venda de R$500 ou mais cria posicao B com referencia
R$500 (revisao 2). Todos permanecem no **mesmo motor**.
Uma compra em pedido separado nao soma com outra compra.

**Atenção a pagamentos em transicao:** o prototipo usa o
instante da **confirmacao do pagamento** para escolher a
revisao. Definir juridicamente e no checkout definitivo
como tratar pedidos criados antes da mudanca mas confirmados
depois, cancelamentos, estornos, custos e informacao exibida
ao consumidor. A liberacao comercial so pode acontecer
apos essa regra ser acordada e validada.

## Comparacao matematica da proposta do idealizador

Um evento de venda posterior com referencia R$500 aplicado
ao ciclo de um centro antigo de R$250 foi interpretado para
**simulacao** da seguinte forma:

| Destino do evento do ciclo | Parcela de referencia nova | Referencia hipotetica ao centro antigo | Diferenca proposta a empresa |
|---|---:|---:|---:|
| Participante | R$500 | R$250 | R$250 |
| Empresa | R$500 | R$0 | R$500 |

Ao centro novo de R$500, um evento de destino participante
tem R$500 referenciais. O modulo
`compararParcelaAntigaComNova` calcula cenarios sem
alterar carteira, contabilidade real, fila, tabuleiro ou
saldos. **Nao ha credito, transferencia nem beneficio
real definido ou garantido.**

A diferenca sugerida a empresa **nao e lucro apurado**:
na loja existem fornecedores, pagamentos, tributos,
cancelamentos e outras obrigacoes. Em particular, uma
simulacao de receita nao prova disponibilidade de dinheiro.
Uma futura regra de repasse exige conclusao juridica e
contabil especifica; o painel de configuracao nao ativa isso.

## Isolamento

A configuracao editavel e **exclusivamente local**,
com token admin; nenhuma rota publica de alteracao foi criada.
Nao altera os exemplos anteriores do razao financeiro,
movimenta PIX, muda precos dos produtos publicados ou
executa contemplacoes. O catalogo de cursos PDF
demonstrativo ainda exibe R$250; mudancas futuras de
preco comercial precisam de revisao especifica.

Implementacao e testes: `configuracao-valor-loop-demo-sqlite.js`,
`ponte-compras-convites-demo-sqlite.js`,
`escritorio-individual-demo.js`,
`admin-financeiro-demo.js`, painel HTML/JS e
`test/reajuste-valor-loop-demo.test.js`.


## Previa do impacto antes de registrar

No mesmo painel administrativo, o botao
**"Simular impacto sem salvar"** recebe o valor cogitado (por
exemplo R$ 500). Consulta exclusivamente as referencias
historicas ja gravadas, agrupa o numero de posicoes em
cada revisao e compara o evento hipotetico do participante.
Nao altera o valor em vigor, cria posicoes ou repassa nada.

A rota `GET /api/admin/valor-loop-demo/impacto?novoValorCentavos=50000`
exige a mesma autenticacao administrativa local. Retorna
quantidades agregadas; nao expõe titular, CPF, pedido ou
convite. A lista de posicoes individuais exibe o valor
historico de referencia em cada local atual (B, A ou vaga),
sem mesclar referencias de outros titulares.

Se uma referencia hipotetica cair de R$ 500 para R$ 250,
a comparacao mostra **R$ 250 de deficit de cobertura**
em um evento originalmente referenciado a R$ 500. Nao reduz
automaticamente a referencia antiga nem trata a falta de
recursos como saldo disponivel.

A proposta de diferencial para a empresa em ciclos antigos
continua exclusivamente uma comparacao — **nao foi gravada
como regra de credito ou saque**. Nada que envolva dinheiro
real e automatico, mesmo quando o administrador muda o valor
no simulador.

Casos exercitados: reajustes sucessivos com posicoes
registradas a R$ 250, R$ 500 e R$ 750,
`test/reajustes-consecutivos-posicoes-historicas-demo.test.js`
e previas autenticadas de grupos historicos em
`test/reajuste-valor-loop-demo.test.js`.
