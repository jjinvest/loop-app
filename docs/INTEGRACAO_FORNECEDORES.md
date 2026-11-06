# LOOP - modelo de vendas por distribuidores conectados (dropshipping)

## 06/11/2026 — Frete da franquia calculado dentro da AKITEMM, sem Shopee

**Decisão do proprietário:** a AKITEMM é o ponto de venda e checkout. A
franquia/distribuidor faz fisicamente a separação, postagem, transporte e
entrega; a loja não contrata nem opera transportadoras. O cliente informa o
CEP no carrinho da AKITEMM e vê uma **cotação real devolvida pela API do
fornecedor**, com preço e prazo antes de autorizar o pagamento. O frete não
deve ser inventado, tabelado localmente sem autorização ou confundido com
custo, margem ou posição no LOOP.

**Shopee não é a rota desejada:** a franquia já possui integração com a
Shopee, mas isso não demonstra que ela permita usar as mesmas credenciais
ou receber pedidos de lojas independentes. Antes da conexão direta,
confirmar documentação/termos da API específica para parceiros externos
da franquia, autorização comercial e fiscal, endpoints e homologação.

**Fluxo desejado para produto FÍSICO, após autorização e prova do parceiro:**
1. Produto AKITEMM ligado a `fornecedorId` e SKU externo; consultar
   disponibilidade e custo, sem alterar identidade comercial local.
2. Cliente informa CEP; servidor faz cotação em tempo real no fornecedor
   pelo CEP, SKU e quantidade, recebe preço em centavos, serviço, prazo,
   identificador de cotação e validade. Múltiplos fornecedores exigem
   cotação e totalização por origem sem duplicar/omitir fretes.
3. Mostrar subtotal, frete e total final **antes** do Pix; congelar no
   pedido a cotação válida, serviço escolhido, custo do fornecedor e
   informações necessárias para auditoria e atendimento. Sem cotação
   verificável, **não prometer nem cobrar frete físico**.
4. Depois de pagamento confirmado independentemente pelo PSP, enviar uma
   única ordem ao fornecedor, com SKU, quantidade e endereço mínimo
   necessário, usando identificador de idempotência e fila durável. Queda,
   timeout ou resposta indefinida exigem reconciliação, não POST duplicado.
5. Receber o pedido externo e os eventos autenticados de separação,
   transporte, rastreamento, entrega, devolução e falha; mostrar em
   `Meus Pedidos` e no Administrador, sem permitir declarar entrega real
   por um botão local.
6. Dados pessoais, nota fiscal, quem cobra/repassa frete, política de
   devoluções e custos do fornecedor dependem de contrato. A AKITEMM,
   sendo a vendedora, mantém deveres legais perante o comprador.

**Cursos/PDFs não exigem frete.** A loja permanece aberta a compras
sem novas posições quando o titular já tem dez posições ativas ou
reservadas; frete não ativa posição por si só. A composição e os
valores dos pacotes ROXOS continuam sujeitos à configuração própria
e à aprovação financeira/jurídica.

**Estado técnico atual:** já existem vínculos SKU/fornecedor e
importação simulada. Em `src/integracoes/registro-fornecedores.js` foi
incluído o método **opcional** `cotarFrete` com validação de CEP,
SKUs, quantidade, prazo, valor, expiração e retorno de cotação. Ele
**não acessa nenhuma API real e não habilita checkout** até ser
implementado o adaptador autorizado da franquia; sem adaptador, retorna
erro explícito, em vez de preço fabricado. Testes de contrato em
`test/registro-fornecedores-frete.test.js`.

**Bloqueio externo atual:** falta o nome/painel/documentação da franquia,
forma autorizada de conexão externa, credenciais guardadas em serviço
seguro (nunca no chat/GitHub) e ambiente de homologação. Não conectar
direto com Shopee nem habilitar expedição real sem estes elementos.

## Modelo comercial informado pelo idealizador

A maioria dos produtos fisicos sera apresentada na vitrine do LOOP, mas
**estoque, separacao, frete e entrega serao executados por fornecedores ou
plataformas parceiras**. O LOOP deve disponibilizar fotos, video de apresentacao
opcional, descricao, preco e status de pedido.

O modelo pretendido envolve **recebimento da compra na plataforma
LOOP e posterior repasse do preco contratado ao distribuidor**, desde
que autorizado contratualmente e por um provedor de pagamentos adequado.
Apos confirmacao verificavel, o backend devera transmitir o pedido
ao distribuidor pela API aprovada, com os dados minimos de entrega. O distribuidor processa
a entrega, e o sistema atualiza o rastreamento.

## Dropshipping com o LOOP como vendedor da mercadoria

**Definicao de negocio confirmada pelo idealizador em 14/10/2026:**
o LOOP e a loja vendedora, faz a venda ao cliente,
recebe pelo checkout proprio e atende o consumidor.
O distribuidor e o fornecedor contratado para entregar
o produto diretamente ao endereco do comprador.
Nao ha compra antecipada de estoque; a aquisicao
ou liquidacao da mercadoria acontece vinculada a
cada pedido, com seu custo obrigatoriamente contabilizado.

A arquitetura deve conter um **custo de fornecedor**
para cada item/SKU/pedido (valor vigente e documentado),
independente do preco final definido pelo LOOP.
Exemplo ilustrativo: preco final R$600, fornecedor
R$300, parcela de referencia da fila R$100.
Restam R$200 de contribuicao BRUTA hipotetica,
antes de tributos, taxas financeiras, estornos, suporte
e demais custos realmente atribuiveis a operacao.

O cliente nao precisara contatar o distribuidor:
o LOOP exibe andamento, atende reclamacoes e deve
cumprir suas responsabilidades legais de vendedor.
A plataforma parceira administra estoque, postagem
e transporte, reportando os eventos por integracao.

O enquadramento fiscal e os instrumentos necessarios
para checkout, nota fiscal, repasses e reembolsos
continuam pendentes de validacao por profissionais;
isto nao torna o LOOP uma simples afiliada de comissoes.

## Regra operacional: LOOP e vitrine, nao operador de frete

Esta e uma decisao central do negocio:

- **LOOP** exibe e vende o produto (quando checkout dentro do LOOP
  estiver tecnicamente e contratualmente autorizado). Registra o pedido
  e transmite ao parceiro somente os dados necessarios para atendimento.
- **Parceiro/franqueador/distribuidor** administra o estoque, separacao,
  embalagem, transportadora, postagem, movimentacao, rastreio e entrega.
  A operacao material de logistica e integralmente terceirizada.
- **LOOP** recebe do parceiro o identificador do pedido e as atualizacoes
  de situacao por API ou notificacoes autorizadas e as **repassa ao
  cliente** na vitrine/area de acompanhamento. O LOOP nao deve se tornar
  controlador operacional de frete, estoque ou transportadoras.
- Em problemas, o LOOP registra a ocorrencia, encaminha a solicitacao
  ao parceiro e transmite as respostas ao cliente. Isso nao elimina
  eventuais deveres de atendimento, garantia, solucao e reembolso
  da empresa vendedora perante a legislacao brasileira.
- No sistema definitivo, status de separacao/transporte/entrega sao
  espelhados do **sistema de origem do parceiro**, com identificadores
  externos, instante do evento, validacao de origem, deduplicacao,
  reconciliacao e historico. Um administrador do LOOP nao deve
  declarar entrega real apenas alterando uma tela local.

A mudanca de transportadora, operador ou fornecedor nao deve exigir
alterar o cadastro comercial do produto ou o motor das filas.
O painel atual permite simular eventos manualmente **somente para testes**.


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
5. Posição no LOOP: compra e posição são direitos distintos. Carrinho
   qualificado **VERDE** gera no máximo uma posição quando os produtos
   verdes elegíveis somam pelo menos R$250; **CINZA** gera zero; **DOURADO**
   gera uma por unidade dentro do teto; **ROXO** usa regra especial
   configurada e aprovada no Administrador. Limite de dez posições ativas
   por titular, **sem limite para novas compras**. Respeitar reserva
   pré-cobrança e comunicar compras sem posição antes do Pix.
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

## Importacao de vitrine de fornecedor (somente laboratorio)

A base de integracao inclui um **importador de catalogo simulado**: um
adaptador pode entregar ate 100 itens por lote, preparar a visualizacao,
e so gerar rascunhos no banco apos confirmacao explicita e conferencia
da revisao do lote. Nao ha preco de venda automatico, envio de mercadoria,
importacao de fotos externas ou criacao de posicoes em filas. Produtos
ja editados pelo administrador nao sao sobrescritos.

Ver `docs/IMPORTACAO_CATALOGO_SIMULADA.md`. A API real de distribuidores
e as permissoes da Shopee ainda nao foram confirmadas.

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

Os modelos demonstrativos nao sao ofertas reais. Existe um painel
administrativo de laboratorio isolado, mas nao existe checkout, upload de imagens,
integracao de fornecedores reais, estoque sincronizado ou pagamentos.
