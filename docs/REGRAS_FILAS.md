# Regras de ordenacao das filas (simulacao)

## Como entram as posicoes

- Cada venda distinta gera **uma posicao unica**, independentemente do valor do produto.
- Uma pessoa pode ter varias posicoes, cada uma com identificador proprio.
- A entrada inicial e na fila B (branca).
- Convites/indicacoes validos associados ao participante permitem a promocao para a fila A (amarela).
- Eventos de venda e convite com mesmo identificador sao tratados sem duplicacao.

## Como a fila A e ordenada

1. **Mais indicacoes validas vem primeiro.**
2. **Empate na quantidade: fica na frente quem completou aquela mesma quantidade primeiro.** Se ambos tem 3, vale o horario do 3o convite; se ambos tem 5, vale o do 5o; se ambos tem 10, vale o do 10o; e assim para qualquer quantidade.
3. **Nao** usar o horario do primeiro convite quando ambos possuem varios convites. Comparar a data e hora do ULTIMO convite valido contabilizado de cada participante (o horario em que concluiu a quantidade empatada).
4. O registro de horario deve conter data, segundos e, quando disponivel, milissegundos, com origem confiavel no servidor.
5. Quando os instantes forem identicos ate o milissegundo, usar uma ordem de evento confiavel como desempate residual.

> Exemplo: Ana e Bruno tem 10 indicacoes validas cada. Ana concluiu a decima as 14:30:10 e Bruno as 14:35:20. Ana fica na frente, mesmo que Bruno tenha feito seu primeiro convite mais cedo. Se Bruno fizer uma 11a indicacao valida, ele passa a frente por ter uma indicacao a mais.

A validacao de convites pode acontecer depois do momento real do convite; por isso, na futura integracao definitiva, o campo `convidouEm` precisara vir de um **registro confiavel do instante em que o convite foi feito**, nao de horario digitado ou enviado arbitrariamente pelo cliente.

## Como a proporcao A/B funciona

Quando ha posicoes esperando nas duas filas, o motor seleciona tres posicoes da A, depois uma da B. Se alguma fila esta vazia, a outra pode continuar. O contador da sequencia e preservado para que a B nao perca sua vez quando voltar a ter posicoes.

## Limites desta etapa

- Estes mecanismos sao **simulacoes em memoria**, sem persistencia e sem autenticar vendas/indicacoes no mundo real.
- Nao existe pagamento real, liberacao financeira nem confirmacao de contemplacao.
- O tabuleiro e a catraca sao modulos separados e ainda precisam de integracao e testes completos.
