# Regras de ordenacao das filas (simulacao)

## Como entram as posicoes

- Cada venda distinta gera **uma posicao unica**, independentemente do valor do produto.
- Uma pessoa pode ter varias posicoes, cada uma com identificador proprio.
- A entrada inicial e na fila B (branca).
- Convites/indicacoes validos associados ao participante permitem a promocao para a fila A (amarela).
- Eventos de venda e convite com mesmo identificador sao tratados sem duplicacao.

## Como a fila A e ordenada

1. **Mais indicacoes validas vem primeiro.**
2. **Empate na quantidade: primeiro quem realizou o primeiro convite valido mais cedo.**
3. O horario do primeiro convite e um dado imutavel para o desempate. **Nao** se usa o horario em que a pessoa atingiu 2, 3 ou outra quantidade de indicacoes.
4. O horario precisa ter data, hora, segundos e, quando disponivel, milissegundos, de origem confiavel do servidor.
5. Se dois registros tiverem o mesmo horario exato, a ordem de processamento confirmada pelo sistema desempata.

> Exemplo: Joao e Pedro tem 3 indicacoes cada. Joao convidou primeiro as 10:15:20; Pedro, as 10:15:35. Joao fica na frente, mesmo se Pedro completou a terceira indicacao antes.

A validacao de convites pode acontecer depois do momento real do convite; por isso, na futura integracao definitiva, o campo `convidouEm` precisara vir de um **registro confiavel do instante em que o convite foi feito**, nao de horario digitado ou enviado arbitrariamente pelo cliente.

## Como a proporcao A/B funciona

Quando ha posicoes esperando nas duas filas, o motor seleciona tres posicoes da A, depois uma da B. Se alguma fila esta vazia, a outra pode continuar. O contador da sequencia e preservado para que a B nao perca sua vez quando voltar a ter posicoes.

## Limites desta etapa

- Estes mecanismos sao **simulacoes em memoria**, sem persistencia e sem autenticar vendas/indicacoes no mundo real.
- Nao existe pagamento real, liberacao financeira nem confirmacao de contemplacao.
- O tabuleiro e a catraca sao modulos separados e ainda precisam de integracao e testes completos.
