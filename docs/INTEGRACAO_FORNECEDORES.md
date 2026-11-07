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

## Atualização de 07/11/2026 — fornecedor já escolhido, conexão aguardando loja

**Esclarecimento do proprietário:** o fornecedor/franquia **já existe e está disponível**. Não há missão de procurar, escolher ou negociar novo fornecedor. O proprietário aguarda a **preparação da AKITEMM** para conectá-lo e fornecerá as informações necessárias quando o encaixe técnico estiver pronto. Não solicitar credenciais sensíveis no chat nem presumir que a franquia disponibiliza uma API idêntica à Shopee.

**Preparação técnica concluída nesta etapa (sem conexão ao fornecedor externo):**
- `src/integracoes/registro-fornecedores.js`: preservado contrato v1 de estoque/status/frete e acrescido diagnóstico read-only `diagnosticarIntegracao({fornecedorId})`. Diferencia *fornecedor que existe fora da plataforma* de *adaptador ainda não configurado*; identifica capacidades de estoque, frete, envio idempotente e reconsulta por chave. **Não transmite nada** ao fornecedor nem declara checkout pronto apenas por métodos presentes.
- `src/producao/pedidos-fornecedor-outbox.js`: criado outbox SQLite persistente e cifrado por AES-256-GCM, com **um único pedido por par pedido/fornecedor**, registro somente após reconsulta autoritativa injetada do PSP, replay idempotente, envio preparado com chave estável, transição para `INDETERMINADO` antes da chamada HTTP e **bloqueio de reenvio automático** quando houver timeout/queda. Reconciliação consulta a chave de idempotência no adaptador antes de marcar como enviado. Nenhum cliente, CPF/endereço, token do fornecedor ou código de rastreamento aparece nos logs do teste; dados de entrega são cifrados no SQLite. **Não há rota HTTP de envio, PSP de produção, adaptador da franquia nem disparo de ordens reais habilitado.**
- A sessão da conta real foi corrigida para cookie `HttpOnly; Secure; SameSite=Strict; Path=/` (em vez de `Path=/api`), necessário para o navegador transportar a mesma sessão tanto a `/escritorio` como a `/loja`. Isso evita bloquear a vitrine real de um usuário que acabou de entrar na conta. Validação CI [42342607994](https://github.com/jjinvest/loop-app/actions/runs/42342607994).
- Provas de contrato e outbox em [CI 42342874784 — SUCCESS](https://github.com/jjinvest/loop-app/actions/runs/42342874784) incluem cenário de timeout após envio possivelmente aceito, retomada sem duplicação, criptografia de endereço, pagamento não confirmado proibido e duas conexões no banco.

**Quando solicitar a conexão ao proprietário:** somente depois de concluir a interface de integração do produto/pedido comercial e preparar ambiente de homologação com segredos e rotas de parceiro. Então pedir **nome da plataforma/franquia e documentação oficial (link/manual) com autorização para pedidos da loja independente, preços/estoque, frete, envio idempotente, consulta por chave e rastreio**; credenciais serão configuradas diretamente no provedor de infraestrutura, não compartilhadas no chat/GitHub. Não afirmar que o fornecedor falta — o que falta é a integração tecnológica.


### Bloqueio adicional eliminado — revalidação do pagamento e pedido antes do despacho

- Descoberto em 07/11/2026: o outbox anterior verificava o PSP somente no registro inicial. Um pedido poderia ser enviado depois de estorno/cancelamento; além disso, itens e endereço eram aceitos do chamador sem confronto com o pedido original persistido.
- `PedidosFornecedorOutbox` agora exige **duas fontes internas confiáveis**: `consultarPagamentoConciliado({pedidoId})` (reconsulta autenticada do PSP, sem aceitar comprovação do navegador) e `consultarPedidoAprovado({pedidoId})` (pedido interno final com fornecedor, pagamento, valor, itens e endereço). O valor, o pagamento, os itens e o destino devem coincidir antes de gravar o outbox; todos são **reverificados imediatamente antes do despacho**. Estorno, cancelamento, alteração de SKU, endereço ou pagamento interrompem o envio, deixando o pedido como PENDENTE para análise.
- O outbox continua cifrado, idempotente e fail-closed na ausência de confirmação do fornecedor. Nenhuma API comercial real foi habilitada. Sem adaptador concreto da franquia, fonte interna de pedido comercial ou PSP produtivo, **não conectar clientes reais ao checkout**.
- Commits `960c4369de8539a7d5b6ff792e3fa2ff32ab0073`, `df60d2798e9e235f63e84bd25c2e68ef19198fe1`, ajuste de expectativa `87a50c55b80f3c0de50406c5c2de3280f443e0e5`. CI [42343314499 — sucesso](https://github.com/jjinvest/loop-app/actions/runs/42343314499). Testes verificam Pix não conciliado, Pix estornado antes de despacho, carrinho divergente, pedido cancelado após confirmação, replay, e recuperação de envio com timeout.


## Loja com vários produtos e distribuidores — decisão confirmada em 07/11/2026

**Requisito confirmado pelo proprietário:** haverá **muitos produtos e muitos distribuidores**, não um fornecedor exclusivo da AKITEMM. O fornecedor mencionado anteriormente já existe e será conectado quando a loja estiver pronta; a arquitetura deve aceitar novos distribuidores sem reescrever a loja e sem presumir que todos possuem uma API idêntica.

**Integrações preparadas e comprovadas no código, ainda SEM venda real:**
- `src/producao/catalogo-multidistribuidores-sqlite.js`: catálogo SQLite persistente sem itens ou fornecedores fictícios pré-cadastrados; **N produtos ↔ N distribuidores**, com ID do produto, SKU específico por distribuidor, preço em centavos, prioridade administrativa, ativação independente e bloqueio até o distribuidor ser homologado. Um mesmo SKU pode existir em distribuidores diferentes, mas não vincular dois produtos distintos ao mesmo distribuidor/SKU. Sem limite artificial de quantidade de produtos cadastrados.
- `src/producao/cotacoes-multidistribuidores-sqlite.js`: liga catálogo configurado, consulta de estoque e cotação de frete do **distribuidor correspondente**; permite recorrer a oferta alternativa do mesmo produto quando o primeiro distribuidor não tem estoque; agrupa itens e frete por fornecedor. A prévia não envia CPF/nome/endereço completo, apenas CEP e SKUs. O comprador escolhe o serviço de frete disponível para **cada** grupo e confirma os valores; variação de preço/frete exige nova confirmação. Cotação aprovada fica cifrada no SQLite, com vencimento curto e titular vinculado.
- `src/producao/pedidos-comerciais-sqlite.js`: **uma compra, um pagamento total**, vários grupos de itens e várias remessas por distribuidor. Cada quote exige titular e CEP final coincidentes; carrinho de outra conta ou outro destino é rejeitado; preço e frete nunca são informados arbitrariamente pelo navegador. A conta precisa ter e-mail confirmado e só há status de expedição após reconsulta do PSP.
- `src/producao/pedidos-fornecedor-outbox.js`: uma remessa idempotente por par (pedido, distribuidor), só compartilha com cada adaptador os **seus próprios SKUs** e dados de entrega cifrados em repouso. Reconfere total do pagamento e status do pedido antes de despachar; estorno antes do envio cancela a remessa restante. Falha de comunicação deixa estado `INDETERMINADO` para reconsulta, evitando duplicações.
- Testes integrados: [42343906037](https://github.com/jjinvest/loop-app/actions/runs/42343906037) (carrinho multiparceiro), [42344058800](https://github.com/jjinvest/loop-app/actions/runs/42344058800) (proteção de titular+CEP), [42344261716](https://github.com/jjinvest/loop-app/actions/runs/42344261716) (catálogo multi-oferta) e [42344431794](https://github.com/jjinvest/loop-app/actions/runs/42344431794) **SUCCESS** (catálogo → estoque/frete → cotação → pedido total → duas remessas). Os adaptadores nos testes são fictícios, sem chamadas externas.
- **Respeitar o trabalho aprovado**: nenhuma nova tela foi criada; o backend comercial é separado do laboratório e continua fora de rotas públicas, sem fornecedores reais conectados nem pagamentos reais habilitados. PR #1 DRAFT; nenhum deploy de código de loja real no Railway.

**Faltam de verdade para inaugurar**: conectar cada distribuidor já contratado conforme seu canal autorizado (API, portal ou integração operacional), carregar produtos/preços/SKUs reais, obter estoque e cotações de frete genuínos, homologar pedidos e rastreamento, integrar PSP de produção e reconciliação, nota fiscal, políticas de atendimento/devolução e validar o fluxo ponta a ponta com clientes reais sob liberação jurídica/financeira. Não converter automaticamente a conclusão técnica em aprovação de cobrança. Quando a loja estiver em condições de receber o primeiro parceiro, pedir ao proprietário somente o nome e documentação do canal de integração; não pedir senhas no chat.


## Acompanhamento de pedidos reais na tela AKITEMM aprovada — 07/11/2026

- Foi integrada a seção **Meus Pedidos** que já existia na vitrine aprovada, **sem redesenhar a loja**. `src/producao/interface-aprovada-loja.js` consulta `GET /api/loja/pedidos` depois do login e pelo botão de atualização; renderiza cada pedido e remessa do distribuidor com `textContent`, evitando HTML arbitrário. Não há registros fictícios nem controle de checkout aberto.
- `src/producao/servidor-identidade-loop.js` passa a aceitar **opcionalmente** duas dependências confiáveis: `pedidosComerciais` e `remessasOutbox`. Ambas devem existir juntas; sessão define `titularId` para `listarDoTitular({titularId,limite:30})`. IDs recebidos de query string são ignorados. Cada remessa é pesquisada por par `(pedidoId,fornecedorId)`, sem expor endereço de entrega, segredos, e-mail ou CPF. Saída limitada a 30 pedidos; consultas não concedem posição, pagamento ou saque.
- **Sem conexão de PSP, catálogo e distribuidor externos**, a rota retorna `503 PEDIDOS_REAIS_AINDA_NAO_INTEGRADOS` e o navegador informa explicitamente que o acompanhamento ainda está em preparação, em vez de inventar histórico. As dependências não foram injetadas no bootstrap de produção, pois faltam provedores comerciais verificados. A visualização continua segura mesmo quando o backend de pedidos reais não foi autorizado.
- Prova de dois titulares com cookies diferentes e tentativa de forçar o titular alheio por `?titularId=` está em `test/meus-pedidos-titular-real.test.js`. **CI completo** [42345555010 — SUCCESS](https://github.com/jjinvest/loop-app/actions/runs/42345555010) SHA `3041e8dd10f307e9ce2d70c793e5762bbf39bb06` inclui a operação do backup externo preparado, suspensão de novos cadastros quando a prova do backup vence e consulta de pedidos isolados.
- O serviço real no Railway permanece **STAGED**, sem dados pessoais, faturamento, PSP ou novos parceiros ativados. Homologação `akitemm-escritorio-preview` preservada. A próxima conexão depende de documentação e do canal técnico real do primeiro distribuidor e do PSP de produção; usuário informou que os distribuidores já existem.


## Gestão de preço, custo e contador no administrador — 07/11/2026

**Decisão operacional confirmada pelo proprietário:** a **AKITEMM é responsável por vender, captar dados necessários à entrega e receber o pagamento do cliente**. Depois da confirmação/reconciliação do pagamento e conforme o contrato e as condições de disponibilidade de caixa, a AKITEMM **paga o custo de aquisição ao distribuidor** e solicita a expedição. O destinatário pode ter várias remessas se o pedido incluir produtos de diversos distribuidores. Não compartilhar CPF/endereço completo além do necessário para a expedição; cada parceiro recebe somente os itens da própria remessa.

**Campos exigidos no Escritório do Administrador:** produto, distribuidor, SKU, **preço final cobrado do cliente**, **custo de aquisição unitário no distribuidor** e **diferença bruta unitária** (preço de venda menos custo de aquisição). Frete, tarifa do PSP, tributos, embalagens, devoluções, custos adicionais e obrigações específicas do LOOP são categorias distintas: a diferença bruta **não é lucro líquido nem disponibilidade para saque**. O contador fará a classificação e o cálculo tributário; nenhuma alíquota é presumida pelo software.

**Código preparado e testado, não implantado em produção:**
- `src/producao/catalogo-multidistribuidores-sqlite.js` já permite configurar **preço de venda** por oferta do distribuidor; o painel de laboratório aprovado já apresenta o campo de preço em `src/candidato/escritorio-admin-candidato-ui.html`, mas **ainda não é o painel comercial real**.
- `src/producao/controle-economico-loja-sqlite.js` agora guarda custo privado por par produto/distribuidor, revisões esperadas e histórico de alterações não sobrescritível; mostra preço de venda, custo e diferença bruta mesmo se negativa. Não contamina o catálogo do cliente com custo ou margem.
- `src/producao/rotas-admin-economia-akitemm.js` expõe **somente quando montado pelo gateway administrativo definitivo** endpoints protegidos para listar valores, atualizar custo com controle de concorrência e exportar CSV para o contador. Exige middlewares **obrigatórios** de autenticação administrativa e anti-CSRF, além de origem HTTPS; não há rota administrativa aberta no app de contas ou no Railway atual.
- O CSV traz produto, distribuidor, SKU, preço de venda, custo de aquisição, diferença bruta, revisão do custo e campos que assinalam explicitamente **tributos e lucro líquido NÃO apurados**. Sem números fiscais inventados. Registros fiscais/contábeis por venda, comprovantes de pagamento, frete efetivo, tarifas e cancelamentos também serão necessários antes do relatório completo de operações reais.
- CI **SUCCESS**: [42346792817](https://github.com/jjinvest/loop-app/actions/runs/42346792817), inclui testes de custos, múltiplos distribuidores, histórico de revisão, exportação, fronteira cliente/admin, CSRF e acesso sem credenciais. Os testes usam valores artificiais; **não são vendas ou custos reais**.

**Próxima ligação para a experiência aprovada:** incorporar os novos campos e exportação ao departamento PRODUTOS/FINANCEIRO do **Escritório Administrativo existente**, sem redesenhar a tela, assim que o gateway de produção tiver autenticação e segregação comprovadas; registrar snapshot de custos, preço, pagamentos e documentos fiscais de cada pedido real para contabilidade histórica. Não afirmar que a edição de custo já aparece no painel público nem que a exportação equivale à escrituração fiscal concluída.

**Separação financeira crítica:** a margem comercial não pode ser contada como saldo dos cofres do LOOP ou crédito disponível para remuneração; despesas e eventuais benefícios exigem provisões, conciliação e revisão jurídico-contábil independentes.


## Exportação de vendas para o contador — 07/11/2026

A exportação privada foi estendida além do catálogo de produtos:
- `PedidosComerciaisSQLite.listarResumoContabil()`: histórico de pedidos com `pedidoId`, datas de criação/última atualização, `pagamentoId`, status, subtotal congelado de produtos, frete cobrado do cliente, valor bruto total, fornecedores e quantidade de unidades. Lê os dados do pedido originalmente cifrado, **sem nome, e-mail, CPF, endereço ou credenciais**. Verifica que `receitaProdutos + freteCobrado = valorTotal` antes de retornar.
- `criarRouterAdminEconomiaAkitemm` oferece `GET /contador/pedidos.csv` e `GET /contador/catalogo.csv` **somente** quando o gateway definitivo injeta autenticação administrativa e CSRF real; acesso de cliente retorna 401. Os arquivos não alegam taxas PSP conciliadas, custos do fornecedor já pagos, impostos apurados ou lucro líquido calculado. A soma por pedido ocorre em uma linha por pedido, sem duplicar valores por SKU/remessa.
- **Validação código**: [CI 42347100010, SUCESSO](https://github.com/jjinvest/loop-app/actions/runs/42347100010), inclui provedor de pedidos multidistribuidor com valores congelados, controle de acesso administrativo ao extrato e exportação.
- Não corresponde ainda ao SPED, XML de NF-e, escrituração, extrato bancário, nota de aquisição do distribuidor ou guia tributária. Esses documentos serão recebidos e conciliados em etapas posteriores. As taxas e impostos reais serão informados por PSP/contabilidade, não inventados pelo motor do LOOP.
- **Interface**: o valor de venda já consta na área PRODUTOS do admin LAB; custo de aquisição, diferença bruta e exportações agora têm backend privado preparado. **Ainda faltam acoplá-los visualmente ao painel administrativo real aprovado e ativar o gateway administrativo segregado**. A prévia de laboratório e a PR DRAFT não sofreram merge/deploy.

## Custos históricos congelados por venda — pendência real corrigida

**Problema comprovado na revisão do código:** a AKITEMM possuía preço de venda histórico no pedido, mas o custo da aquisição por distribuidor era consultado somente na tabela atual de ofertas. Depois de uma alteração de custo, uma venda antiga podia ser interpretada pela diferença de preço atual, prejudicando a apuração contábil.

**Correção no núcleo comercial (sem mexer na WeDrop):** a criação do pedido escreve, **na mesma transação SQLite**, a tabela `loja_real_custos_pedido` com uma linha imutável por combinação de pedido/distribuidor/SKU: produto quando localizado, quantidade, preço unitário praticado, custo unitário então cadastrado, revisão do custo e horário. Triggers impedem UPDATE/DELETE dessas linhas. Se o custo ainda não estiver cadastrado, grava `NULL` explicitamente e o relatório marca custo/margem **desconhecidos**, sem fingir que o produto foi adquirido por R$0. A conta do pedido continua com **1 pagamento total e N remessas**, e o cliente continua sem acesso a preços de aquisição ou margem.

**Relatório do contador:** `PedidosComerciaisSQLite.listarResumoContabil()` agora incorpora custo estimado congelado e diferença bruta estimada por venda quando **todos os itens** possuem custos; `/contador/pedidos.csv` oferece colunas correspondentes em rota exclusiva do administrador. **Não** comprova o pagamento real de aquisição, liquidação do PSP, imposto ou lucro líquido. Frete cobrado do comprador continua separado das despesas de envio efetivamente pagas.

**Prova técnica:** [CI completo aprovado](https://github.com/jjinvest/loop-app/actions/runs/42350675827), SHA `3b6ff2cae4f40b71f3c73a2337b49645ffd84792`. Os cenários verificam compra com dois distribuidores, custo histórico preservado após mudança de preço/custo, snapshot não mutável, replay sem duplicação, custo ausente declarado como desconhecido e banco sem dados pessoais nos registros contábeis. Testes com dados fictícios, não pagamentos externos. PR #1 permanece DRAFT; nenhuma implantação comercial ocorreu.

**Próximas pendências independentes do fornecedor:** integração da exportação e edição de custos ao **painel administrativo definitivo aprovado**, reconciliação de taxas e comprovantes de pagamento de custo dos distribuidores, registros de fiscalidade/nota por operação, e backup conjunto das tabelas de pedidos/financeiro. Não apresentar a nova rota como já ativa no Railway LAB.
