# LOOP — limite inicial de compras por CPF (regra proposta)

> Alinhamento do idealizador em 14/10/2026.
> Registro de regra de negocio pretendida, sem coleta de CPFs,
> sem ativar checkout e sem implementar pagamentos ou beneficios.

## Regra informada

**Limite inicial pretendido: ate CINCO compras por CPF.**
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
  no entanto, a politica inicial **nao admite
  mais de cinco compras por CPF no escopo
  do limite**, ainda a ser especificado.
- Indicar, cadastrar-se e ter posicao sao
  eventos separados; indicacoes validas
  continuam seguindo as regras A/B.
- O limite de compras nao muda as regras
  ja previstas para centro, cinco vagas,
  cinco eventos por ciclo, prioridades e
  preparo de pre-lancamento.

## Questao que precisa ser confirmada ANTES de codificar

A expressao "ate cinco compras por CPF" foi confirmada;
**nao foi confirmado** se o limite vale para:

A. Ate cinco compras **no historico total**
   daquele CPF, mesmo depois de uma posicao
   completar o ciclo; ou
B. Ate cinco **posicoes ativas simultaneamente**
   por CPF, voltando a liberar capacidade
   quando uma posicao e efetivamente encerrada;
   ou outra janela especifica.

Esta distincao importa porque o idealizador
tambem descreveu a possibilidade de clientes
voltarem a participar depois de concluir ciclos.
Nao presumir que retornos permitem ultrapassar
automaticamente o limite, nem proibir recompras
apos ciclo sem uma definicao expressa.

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
