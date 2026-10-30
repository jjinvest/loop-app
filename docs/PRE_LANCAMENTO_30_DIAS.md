# LOOP — pre-lancamento planejado e preparacao do tabuleiro

> Registro do que o idealizador explicou em 14/10/2026.
> Premissas comerciais para validacao, NAO especificacao liberada
> para pagamentos, promessa de rendimentos ou recrutamento remunerado.

## Periodo de divulgacao: 30 dias antes de girar a catraca

A ideia e reservar **aproximadamente 30 dias de divulgacao**
antes do inicio dos giros do tabuleiro. Nesse periodo,
o LOOP pretende atrair potenciais clientes, permitir
cadastros e receber indicacoes, de modo que algumas pessoas
possam chegar ao dia da abertura ja com varias indicacoes
registradas e priorizadas conforme as regras do produto.

- `cadastro` representa registro de interesse/cliente.
- `indicacao` representa convite e precisa de identificador,
  prova de validade, consentimento e origem de horario.
- `posicao de fila`, na regra corrente do prototipo,
  nasce **exclusivamente de uma venda valida**.
- Durante a fase promocional, ainda precisa ser definido
  se haveria compras reais e posicoes vinculadas a
  compras, ou apenas cadastros/indicacoes que so
  seriam ativados apos uma compra futura.
- O numero de clientes cadastrados, indicacoes,
  compradores unicos, vendas e posicoes nao e o
  mesmo. Uma pessoa pode comprar varias vezes e
  ocupar varias posicoes depois de cumprir as regras.
- O simples registro de indicacoes nao habilita
  remuneracao, credito sacavel ou promessa de
  retorno financeiro.

## Centro inicial e regra especial pretendida

O idealizador explicou que **deseja ocupar o primeiro
centro do tabuleiro** e, apos o giro inicial, deseja
que a prioridade dos demais participantes seja
definida pelas regras validas de fila e indicacao.

Essa ideia constitui uma **excecao especial** ao
funcionamento ordinario no qual cada posicao
nasce de uma compra valida. Deve ser descrita
com total transparencia ao publico, ter efeitos
e direitos claramente definidos, e passar por
analise juridica independente, especialmente
pela possibilidade de vantagem do operador
sobre clientes pagantes.

**Nao inserir posicao ou beneficio do idealizador
automaticamente no motor do LOOP neste momento.**
A excepcionalidade depende de decisao formal,
avaliacao de direitos, riscos de esquema piramidal,
regras de consumidor e testes matematicos.

## Inicializacao e fluxo do tabuleiro

O motor de testes atual usa um centro e cinco
posicoes periféricas, uma catraca inicialmente
pausada e cinco eventos de venda para concluir
um ciclo. A catraca pausada nao impede entradas
nas filas de simulacao. O centro e as cinco
vagas devem ser preenchidos antes do inicio
dos eventos do ciclo — ressalvadas as regras
especiais ainda NAO aprovadas.

O inicio oficial da catraca precisa de acao
administrativa registrada, com horario confiavel,
estado de filas, regras vigentes e trilha de
auditoria. Nao inventar dados de compradores,
nao considerar indicacao como compra e nao
reclassificar posicoes antigas silenciosamente.

## Pendencias criticas

1. Nos 30 dias, clientes **podem comprar**
   e formar posicoes, ou apenas se cadastrar,
   indicar e esperar o inicio das vendas?
2. Qual evidencia faz uma indicacao ser
   valida e como se evita autoindicacao/fraude?
3. A posicao especial do idealizador tem
   compra associada, saldo anterior ou
   alguma regra juridicamente autorizada?
4. Como sera comunicada a duracao indefinida
   ou variavel da espera e o que acontece
   se a pessoa desistir ou pedir reembolso?
5. Se pagamentos forem recebidos antes de
   iniciar a catraca, quais sao direitos
   dos consumidores, reservas e condicoes
   de liquidacao?
6. Que parte das regras de indicacao
   pode funcionar legalmente sem configurar
   expectativa de remuneracao baseada
   no recrutamento de compradores?

A posicao privilegiada do operador, recompensas
vinculadas a novas vendas e pagamentos aos
participantes requerem **avaliacao juridica
brasileira antes de propaganda, cobranca
ou ativacao de beneficios**.

## Estado tecnico atual

Este documento registra o plano, nao uma
funcionalidade em producao. As filas, tabuleiro,
catraca e relatorio financeiro continuam
**simulados** e sem saques, compras reais,
posicoes iniciais privilegiadas ou pagamentos.
