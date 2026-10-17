# Contrato de regras firmadas — AKITEMM e LOOP V6

> Regras comerciais e operacionais fornecidas pelo proprietário. Não alterar por inferência ou por automatização sem instrução expressa. Somente laboratório até integração bancária, conciliação e validação jurídica.

## Responsabilidades distintas na mesma plataforma

- **LOOP**: plataforma principal e Escritório Virtual (prioritário na experiência); administra cadastro, duas filas A/B, posições, catraca de seis entradas por giro, créditos exclusivamente após conclusão do ciclo de centro, quatro cofres separados e solicitações de saque.
- **AKITEMM**: aba comercial da mesma plataforma; o proprietário decide **quais produtos publicar, seus preços e custo combinado com o fornecedor**. O sistema não cria preços, não escolhe produtos, não recalcula margens autonomamente. Inteligência artificial de precificação não faz parte do escopo atual.
- **Links personalizados de cada cliente**: um aponta ao cadastro e, após login, à AKITEMM; outro aponta ao cadastro e, após login, ao Escritório LOOP. A indicação usa um identificador imutável mesmo se o apelido mudar. Cadastro inicial requer nome de acesso, e-mail, telefone com DDD e senha; CPF é etapa posterior para regras específicas, não exigido no primeiro cadastro.

## Pedido fechado é unidade indivisível de elegibilidade

- Um **pedido individual** é somado **antes de pagar**, com os valores e quantidades dos produtos elegíveis no mesmo carrinho. Depois de pagamento confirmado, o pedido é encerrado e não recebe valores de compras futuras.
- **Compras separadas nunca se somam** para alcançar os R$ 250; um pedido pago de R$ 180 e outro posterior de R$ 100 continuam dois pedidos inferiores ao mínimo — nenhuma posição é criada por essa soma de R$ 280.
- **Primeira compra de qualquer valor**, quando efetivamente confirmada, ativa os dois links de divulgação do titular. Isso **não** dá uma posição no LOOP. A política de indicação prevê a referência base de 10%, mas o registro e eventual habilitação de bonificações observam as condições próprias de CPF, termos, compra indicada e caixa, sem saque real ou promessa de pagamento automático.
- Um pedido de **dois itens de R$ 190 cada**, total R$ 380, pode qualificar **uma posição** no LOOP, desde que os itens sejam elegíveis e as outras condições do motor estejam cumpridas. Um pedido separado de R$ 190 não qualifica. O pedido não se acumula com carrinhos anteriores.
- A regra especial previamente criada para pacote explícito de múltiplas posições continua isolada e não altera a regra normal de uma posição por pedido.

## Ponte financeira simples, sob controle do dono

A fórmula determinada pelo proprietário para **pedido qualificado** é:

`VENDA RECEBIDA = CUSTO DOS PRODUTOS + R$ 250 DESTINADOS AO LOOP + RESTANTE DO PROPRIETÁRIO`

Exemplo **hipotético**, preço de dois produtos R$ 190 cada: R$ 380 de venda, custo combinado dos dois produtos R$ 100, referência LOOP R$ 250, restante do proprietário R$ 30. O proprietário define custo e preço e calcula sua margem **antes de publicar**. Não criar rotinas de frete, impostos ou margens extras na ponte simplificada sem nova determinação.

**Importante**: cruzar R$ 250 de valor do pedido é critério de qualificação de posição, **não prova que existam R$ 250 líquidos disponíveis para o LOOP**. Antes de efetuar separação real é necessário haver recebimento conciliado, custo de produto identificado e saldo suficiente para aquele aporte. Um lançamento comercial não lança caixa do LOOP por si. O helper `ponte-financeira-simples-akitemm-loop-v6.js` calcula o cenário, mas ainda **não bloqueia automaticamente** a ponte de posições nem executa transferência. Esta lacuna deve ser resolvida antes de aceitar dinheiro real.

## LOOP não é um estorno da loja

A AKITEMM responde por cancelamento/devolução comercial; o LOOP não acumula compras, não estorna produtos e não gera novos giros em saques devolvidos. A catraca é uma só: seis compras qualificadas distintas fecham um giro, seja centro de participante ou dourado. Posições aguardando na fila não geram créditos de contemplação; somente ciclos concluídos no centro geram lançamento previsto. O centro dourado destina a respectiva parcela ao quarto cofre. O escritório separa previsões de valores realmente conciliados e sacáveis.

Regras de consumidor, tributação e eventual devolução bancária devem continuar observadas independentemente dessa simplificação operacional.

## Testes de regressão de regras

- `test/regra-fixa-pedidos-nao-acumulam-loop-v6.test.js`: R$ 180 ativa links sem posição; R$ 100 posterior não soma; duas unidades de R$ 190 no mesmo pedido qualificam uma posição; R$ 190 posterior não soma.
- `test/ponte-financeira-simples-akitemm-loop-v6.test.js`: pagar produto + separar R$ 250 + restante do proprietário, sem dinheiro fictício registrado em cofres e sem precificação automática.
- `test/loja-cliente-sessao-carrinho.test.js`: preço congelado do catálogo e disponível para edição somente através das rotas administrativas protegidas do laboratório.

Não publicar nem usar para recebimentos reais sem conciliação, integração segura e revisão jurídica independente.
