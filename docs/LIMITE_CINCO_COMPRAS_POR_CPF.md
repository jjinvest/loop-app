# LOOP — limite confirmado: ate cinco posicoes ativas por CPF


> **Atualizacao de 16/10/2026:** esta documentacao descreve a **regra padrao de uma posicao por pedido**. A excecao de **produto especial autorizado para cinco posicoes no mesmo pedido** foi implementada em laboratorio e esta detalhada em `docs/PRODUTO_ESPECIAL_CINCO_POSICOES_LOOP.md`. O limite de cinco posicoes abertas simultaneamente por CPF (simulado por conta em laboratorio) continua valendo, e uma posicao que conclui o ciclo libera uma vaga. A configuracao especial exige disponibilidade integral de cinco vagas e subtotal especial minimo equivalente a cinco referencias LOOP; nao habilita pagamento real.

> Alinhamento do idealizador em 14/10/2026.
> Registro de regra de negocio pretendida, sem coleta de CPFs,
> sem ativar checkout e sem implementar pagamentos ou beneficios.

## Regra informada

**Limite inicial confirmado: ate CINCO posicoes ativas simultaneamente por CPF.**
Cada compra validada de produto gera uma posicao propria,
independentemente do valor do produto. O limite e para
impedir concentracao excessiva em poucos compradores
de alto poder aquisitivo e favorecer acesso amplo ao LOOP.

Nao comunicar o projeto como um sistema de compras
ou posicoes ilimitadas por participante. A ideia
de ampliar o limite em outra fase fica registrada
como POSSIBILIDADE FUTURA, nao como regra vigente.
Uma alteracao futura exige decisao expressa,
versao das regras, comunicacao ao usuario e
analise dos impactos em vendas, filas e direitos.

## Distincoes obrigatorias

- Um CPF identifica um cliente unico para
  fins de aplicar limites quando houver
  verificacao de identidade autorizada.
- Uma compra nao e uma pessoa nova.
- Cada venda valida gera uma posicao.
- As posicoes podem pertencer ao mesmo CPF;
  a politica inicial nao admite mais de cinco
  **posicoes ativas simultaneamente** por CPF.
- Quando uma posicao encerra seu ciclo por
  contemplacao concluida, deixa de ser ativa
  e libera uma vaga para nova compra valida.
- O historico da posicao concluida e preservado.
- Nao existe limite de cinco compras vitalicias.
- Indicar, cadastrar-se e ter posicao sao
  eventos separados; indicacoes validas
  continuam seguindo as regras A/B.
- O limite de compras nao muda as regras
  ja previstas para centro, cinco vagas,
  cinco eventos por ciclo, prioridades e
  preparo de pre-lancamento.

## Regra confirmada de recomposicao das vagas

Com cinco posicoes ativas, a conta tem zero vagas para nova compra.
Se uma posicao e contemplada e conclui o ciclo, passam a existir
quatro posicoes ativas e UMA vaga disponivel para nova compra.
Se duas concluem, existem DUAS vagas. Ter apenas recebido
parte de um ciclo nao e o mesmo que ter concluido a posicao.
Nenhuma operacao apaga o historico de compras e conclusoes.

## Implementacao futura, depois da confirmacao

- Um identificador interno validado por CPF,
  evitando exibir documentos completos em
  catalogo, URLs, logs, testes ou arquivos Git.
- Regra atomica na confirmacao de compra,
  com bloqueio de excedente mesmo quando
  compras ocorrem em paralelo.
- Estado de posicao e vinculo com compra
  e identidade, com protecoes LGPD.
- Politica documentada para cancelamento,
  reembolso, identidade duplicada,
  contestacao e alteracoes de limite.
- Transparencia com clientes e avaliacao
  juridica independente do mecanismo de
  renda/indicacoes antes da operacao real.

**Nenhum CPF real foi armazenado e nenhuma
rota de pagamento/limite foi ativada nesta etapa.**
