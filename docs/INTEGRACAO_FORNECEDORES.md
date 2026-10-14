# LOOP - modelo de vendas por distribuidores conectados (dropshipping)

## Modelo comercial informado pelo idealizador

A maioria dos produtos fisicos sera apresentada na vitrine do LOOP, mas
**estoque, separacao, frete e entrega serao executados por fornecedores ou
plataformas parceiras**. O LOOP deve disponibilizar fotos, video de apresentacao
opcional, descricao, preco e status de pedido.

O cliente devera, **caso contratualmente e tecnicamente autorizado**, finalizar
a compra no LOOP. Depois da confirmacao do pagamento por um intermediador
autorizado, o backend transmite o pedido ao distribuidor pela API aprovada,
incluindo somente os dados de entrega necessarios. O distribuidor processa
a entrega, e o sistema atualiza o rastreamento.

Cursos digitais continuarao como **PDFs para download**, sem videoaulas hospedadas.
A compra de um produto e a posicao correspondente nas filas permanecem
registros distintos.

## Fluxo pretendido (ainda nao integrado)

1. Catalogo: fornecedor transmite ou permite consultar SKU, imagens autorizadas,
   disponibilidade e preco de custo; o LOOP publica descricao e preco de venda
   aprovados pelo administrador.
2. Carrinho e pagamento: o sistema registra um pedido **PENDENTE** sem criar
   posicao definitiva nem enviar mercadoria.
3. Confirmacao: o servidor confere a venda em retorno autenticado do provedor
   de pagamento, com deduplicacao de eventos; nao aceita afirmacao de pagamento
   enviada pelo navegador.
4. Pedido ao fornecedor: apos confirmacao, envia **uma unica ordem** com
   identificador idempotente, SKU, quantidade e endereco necessario para entrega.
5. Posicao no LOOP: a venda confirmada gera **uma posicao propria**, independente
   do preco, mediante transacao consistente com o estado da compra. O fluxo
   das filas e separado dos pagamentos e da logistica.
6. Acompanhamento: guardar identificador do pedido no parceiro e eventos de
   rastreio, falhas de despacho, extravios, devolucoes e eventuais reembolsos.
7. Falhas e recuperacao: a chamada ao fornecedor pode falhar sem desfazer um
   pagamento confirmado; usar fila de tarefas persistente, reenvio com
   idempotencia, conciliacao e intervencao administrativa auditavel.

## Shopee e a franquia/distribuidor

A Shopee e uma plataforma diferente do sistema do franqueador.
**Nao supor** que a API de um franqueador conectada a uma loja Shopee
possa automaticamente aceitar pedidos pagos fora da Shopee. Precisamos
confirmar com o fornecedor os pontos abaixo:

- Nome da plataforma e documentacao oficial da API, ambiente de testes,
  credenciais, termos, limites e autorizacao para revenda/dropshipping.
- Se e permitida **compra dentro do LOOP** com repasse de pedido, ou se o
  cliente precisa terminar o pagamento no checkout da Shopee.
- Como consultar estoque e custos, obter fotos autorizadas e mapear SKUs.
- Como transmitir pedido e endereco, tratar frete e rastrear entrega.
- Como liquidar valores com o distribuidor, gerenciar notas fiscais,
  cancelamentos, trocas, extravios e devolucoes.
- Quais dados pessoais sao enviados, o fundamento legal, a protecao
  contratual, a LGPD e o regime de responsabilidades perante o consumidor.

### Principio de seguranca

**Nunca** enviar credenciais do fornecedor, dados de cartao ou tokens
de pagamento para o navegador ou armazenar secrets no GitHub.

A integracao sera um **adaptador por fornecedor**, instalado no backend,
com autenticacao, logs sem dados sensiveis, idempotencia, rastreabilidade
e webhooks verificados. Somente a plataforma que tiver API autorizada
sera conectada. O catalogo demonstrativo hoje nao tem integracoes reais
nem recebe pagamentos.

## Construido nesta etapa

- `src/domain/catalogo.js`: modelos de FISICO com
  `entrega: FORNECEDOR_INTEGRADO` e PDF com
  `entrega: DOWNLOAD_APOS_CONFIRMACAO`.
- `src/routes/catalogo.js`: API publica somente leitura.
- `public/index.html`, `public/js/catalogo.js`: vitrine.
- `public/produto.html`, `public/js/produto.js`: pagina individual com fotos,
  video opcional, descricao e explicacao da logistica parceira.
- `public/css/style.css`: apresentacao responsiva.
- `test/catalogo.test.js`: testes automatizados do catalogo demonstrativo.

Os modelos nao sao ofertas reais: nao ha estoque, preco definido, checkout,
painel administrativo de cadastro, upload de imagens nem integracao de fornecedor.
