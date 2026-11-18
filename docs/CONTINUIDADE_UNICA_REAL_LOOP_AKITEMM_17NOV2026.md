# Continuidade da unificação interna LOOP / AKITEMM — 17/11/2026

## MARCO ZERO — contratos atuais prioritários (17/11/2026)

- [ESSÊNCIA DEFINITIVA — fluxo de venda, fintech, caixa, seis luzes, cofres e modos PAUSADO/LIVRE/PROGRAMADO](./ESSENCIA_DEFINITIVA_LOOP_FINANCEIRO_CATRACA_MARCO_ZERO.md). **Prevalece sobre hipóteses anteriores contraditórias; não implica ativação bancária.**
- [PROTOCOLO — como entregar uma cópia limpa e auditável do código do MARCO ZERO para outra IA](./PROTOCOLO_PACOTE_LIMPO_MARCO_ZERO_AUDITORIA_IA.md). O snapshot final será extraído somente do commit realmente concluído e verificado; o histórico original permanece preservado.


## Avanço da unificação real da vitrine — 18/11/2026

- A **aparência do LOOP/AKITEMM permanece absolutamente igual**: nenhuma edição nos HTML, CSS, JS visual, molduras ou artes aprovadas. Modificadas apenas as ligações internas de leitura entre fonte real de identidade e catálogo de mídia, o bootstrap e teste novo.
- `src/producao/catalogo-mercadorias-real.js`: adicionada leitura **somente dos itens FISICO explicitamente publicados**, projetados com `precoCentavos:null`, `compravel:false`, `checkoutReal:false` e cor neutra, sem promoções ou créditos simulados. Os arquivos de fotos/PDF continuam persistidos no banco comercial separado, sem mover dados.
- `src/producao/servidor-identidade-loop.js`: a rota autenticada `/api/loja/catalogo` pode consolidar a vitrine da conta real com a leitura segura do catálogo persistente. Banco de identidade continua única fonte da sessão; IDs duplicados entre catálogos causam falha explícita, nunca sobrescrita silenciosa. Respostas continuam bloqueando checkout.
- `scripts/iniciar-identidade-real-loop.js`: a leitura de mídia é montada **antes do app** na mesma instância real, sem importar o antigo servidor de laboratório. Registro de catálogo do banco comercial central permanece preservado.
- Prova da branch de código `79a1d628e78bb4d034ab1aba9f7eccbd6ee9a4a3`: workflow de regressão integral `44215482564` **1.457/1.457 testes aprovados**, dependências e navegação PC/celular `SUCCESS`. Inclui contrato novo `test/entrada-real-catalogo-midia-conta-unica.test.js` para mesma sessão de loja, API autenticada, preço não inventado, pagamentos fechados e HTML aprovado idêntico.
- Publicado **somente** em `loop-identidade-real` Railway (serviço `ac28edec-50ad-4187-99e2-8f7014735b63`), deployment `b3c008c6-8781-4a16-97b9-ba335ee4f0e7` **SUCCESS**. Entrada pública `akitemmloop.com.br`/serviço `akitemm-escritorio-preview` permaneceu pinado em `cbcc615bc3e7788f3b1d361ff7dfd9ac4353013e`, sem corte público nem alteração visual.
- **Ainda pendente:** comprovar navegação autenticada diretamente no deployment real com contas migradas e inventário completo de mídia; alinhar entrega de fotos pelo domínio definitivo e o contrato de edição do operador; conciliar catálogos se houver IDs duplicados, ampliar paginação além de 100 produtos; não promover o gateway público sem essas provas. Cadastro, pagamentos, repasses, saques e giros financeiros permanecem bloqueados até os requisitos externos.

## Unificação de fotos de produtos com sessão real do operador — 18/11/2026

- Implementado **somente no backend**, sem alterar HTML, CSS, posições, molduras, artes ou botões aprovados: `src/producao/rotas-catalogo-midia-operador.js`, integrado em `src/producao/gateway-admin-comercial.js`. A mesma sessão real do operador usada no escritório administrativo exige cookie válido e CSRF antes de qualquer upload; fotos 1–10, JPEG/PNG/WebP, <=3 MiB, revisão de concorrência e histórico em mídia persistente.
- `src/producao/catalogo-mercadorias-real.js` agora fornece `abrirFotoPublicada` e `listarFotosProdutoCompartilhado`; imagens de produto em rascunho não são públicas. `src/producao/servidor-identidade-loop.js` permite GET autenticado em `/api/loja/produtos/:produtoId/foto/:posicao` e expõe URLs relativas das fotos publicadas na vitrine do mesmo cliente; nenhum BLOB segue no JSON, nenhuma sessão ou segredo é repassado ao catálogo.
- `src/producao/catalogo-multidistribuidores-sqlite.js` lê `buscarProdutoAdministrativo` por ID, permitindo anexar imagens de produto do catálogo principal **sem recriar uma cópia do produto no banco de mídia**. `scripts/iniciar-identidade-real-loop.js` entrega a mesma fonte de catálogo ao operador e cliente. IDs legados incompatíveis não quebram a vitrine; permanecem sem foto até migração explícita.
- Prova da branch `8c6bb4ce0402b0f8b42f3693a6b9e0a64fa36e49`: workflow `44218806266`, **1.458 testes aprovados, zero falhas**, incluindo PC/celular e teste `test/operador-fotos-conta-real-unificada.test.js`: operador autenticado sobe foto, cliente não vê rascunho, publicação habilita leitura, principal mantém produto único, foto posição 10, cookie de cliente não autoriza escrita, API não habilita checkout.
- Publicação controlada: serviço Railway `loop-identidade-real` (`ac28edec-50ad-4187-99e2-8f7014735b63`) deployment `4ca35ea3-c2fe-4f5f-a0f7-95a53871474e` **SUCCESS**. O serviço de entrada pública AKITEMM (`7114bc9a-8d39-477b-ad67-6a625b5aebd5`) permaneceu na revisão anterior `cbcc615bc3e7788f3b1d361ff7dfd9ac4353013e`; sem corte público e sem ativação de dinheiro real.
- **PENDÊNCIAS IMPORTANTES:** a API de mídia já está ligada à sessão real, mas os botões e quadradinhos da interface aprovada ainda precisam acionar essas rotas de modo explícito e ser conferidos no endereço público autenticado. Não afirmar que o clique e upload do operador no cliente final já estão comprovados. Limite atual da consulta por lote é 100 e precisa de paginação para o catálogo futuro de 400 itens. IDs com maiúsculas/sublinhado exigem estratégia de referência de mídia compatível. Fotos persistem no volume comercial: auditar backup externo específico de mídia antes de mudanças de infraestrutura. Preservar a aparência aprovada integralmente durante esses ajustes.
## Regra central (não negociar)

O produto público deve continuar com **um único acesso principal**, `https://akitemmloop.com.br`, e a mesma experiência aprovada de AKITEMM e Escritório LOOP. Não abrir novas prévias, novas contas paralelas, novo painel administrativo ou nova fonte de verdade. Não alterar HTML/CSS aprovados para contornar falha de navegação. Não trocar DNS/domínios sem disponibilidade comprovada.

## Fonte de código e dados

- Repositório: `jjinvest/loop-app`; branch ativa: `feature/unificar-escritorio-real-20261105`.
- Railway: projeto `8c1ab327-16f0-409a-90ac-8f02a3f5eae0`; ambiente atual **denominado** `homologacao`, ID `e5c30d7f-086f-4845-93ad-7d1a5ca5e31b`. O nome do ambiente não prova por si só que todas as operações sejam produtivas.
- Serviço da entrada pública existente `akitemm-escritorio-preview` ID `7114bc9a-8d39-477b-ad67-6a625b5aebd5`; domínio `akitemmloop.com.br` já verificado. Entrypoint ainda `scripts/servidor-escritorio-preview-railway.js`. Não chamar de produção definitiva.
- Serviço da identidade e banco reais `loop-identidade-real` ID `ac28edec-50ad-4187-99e2-8f7014735b63`; entrypoint `scripts/iniciar-cadastro-publico-release.js`; SQLite persistente `/dados-reais/clientes.sqlite`. **Não migrar nem duplicar** base, contas, sessão ou identificadores de titular para contornar bloqueios.
- `loop.com.br` foi **cadastrado** como domínio personalizado no serviço real, mas verificação de propriedade e alteração do DNS ainda pendentes. Não está comprovado como rota pública.
- Serviço `asaas-webhook-staging` permanece separado; não habilitar liquidação, Pix, saque ou catálogo comprável sem provas externas.

## Mudanças realizadas na branch, sem alterar os arquivos visuais aprovados

1. `src/producao/gateway-admin-comercial.js`: `GET /api/operador/estado` verifica **a mesma sessão administrativa** já existente, independente da sessão do cliente, e responde `operador: true/false`.
2. `src/producao/interface-aprovada-loop.js` e `src/producao/interface-aprovada-loja.js`: atalhos de operador da loja apontam para `/administrador` e são visíveis só quando a sessão do administrador é reconhecida; sem nova central.
3. `scripts/iniciar-cadastro-publico-release.js` e `scripts/iniciar-identidade-real-loop.js`: modo `OPERACAO_INTERNA_REAL` separado do `CADASTRO_REAL`. Flag `LOOP_REAL_OPERACAO_INTERNA=SIM` no serviço original. Mesmo motor, contas, SQLite, backup e admin; `permitirCadastro:false`. Não liga checkout, saques, créditos ou pagamentos.
4. Testes adicionados para seleção segura do modo interno e autenticação do operador da loja.

## Atualização de integração de operador — 17/11/2026, 16h44 UTC

- Publicado **no mesmo serviço** `loop-identidade-real` o commit `1a2ff2eb4ebb58c407b709db66c7834780161587` (Railway **SUCCESS**). O gateway original passou a aceitar `POST /api/operador/entrar`, `GET /api/operador/estado` e `POST /api/operador/sair` com a **mesma sessão administrativa** e permissões existentes. Login do escritório definitivo direciona a `/administrador`, sem retorno a `/staging/cliente?modo=operador`.
- O teste `test/entrada-unificada-operador.test.js` foi alinhado: exige rota definitiva no sistema real e preserva apenas no serviço legado o caminho de homologação, enquanto o domínio público não migra. A alteração não alterou HTML/CSS aprovados nem cadastrou novos titulares.
- Auditoria integral GitHub **1.444 / 1.444 testes aprovados**, `0` falhas no run `44128764244`; navegação PC/celular e verificações de dependências aprovadas.
- Railway: três serviços online, zero falhas ativas, versão original `1a2ff2eb` aplicada. **Não está confirmado o uso autenticado no domínio principal**; `akitemmloop.com.br` continua ligado ao serviço legado. Cadastro público, checkout e saques reais permanecem bloqueados.
- Próxima fase é unificar a **entrada pública já existente** com a fonte única de contas e o catálogo originais, sem trocar domínio precipitadamente nem simular titularidade. Atenção: no Railway há pinagem por commit; uma alteração posterior no GitHub não é publicação automática.

## Evidência mais recente

- Em 17/11/2026 foi aplicado ao serviço **original** o commit `9a02d1547b74e81d636b9af1cf560864567f26ef` com a flag de modo interno ativada. O Railway informou **SUCCESS**, réplica online, zero alertas/falhas ativas; implantação e código conferidos.
- Três workflows do GitHub para essa revisão ficaram com resultado **success**: identidade segregada, auditoria do pilar interno e simulação de 1.000 participantes.
- A prova de 2 contas migradas e backup offsite ocorreu no serviço original antes da ativação; não inferir da migração que todos os fluxos do usuário já funcionem.
- O acesso HTTP autenticado de usuário/operador à nova plataforma **ainda não foi comprovado fim a fim** por ferramenta de navegador autenticada. Não declarar 100%.

## Pendências internas concretas (sem atalhos)

1. Concluir a convergência da entrada pública `akitemmloop.com.br` com a **mesma fonte real de identidade/contas**, preservando as telas aprovadas, links de indicação, catálogo editável e dados persistidos. A entrada ainda aponta para o serviço antigo; não fazer corte de tráfego para serviço incompleto.
2. Comprovar a jornada real autenticada: loja -> cadastro (quando autorizado) / login de conta migrada -> escritório -> operador em suas permissões próprias -> upload de produto/foto -> leitura de pedidos/posições/financeiro verdadeiro (sem fabricar transações).
3. Confirmar correlação de catálogo/fotos persistentes com o volume e sistema de arquivos de produção, inclusive após deploy/restart.
4. Separar exclusivamente as dependências **externas** (fornecedor, Celcoin, Asaas, aprovação de termos, autorização de cadastro) dos acabamentos internos. Não tornar a ausência de PSP motivo para deixar funções administrativas internas apenas no laboratório.

## Segurança e publicação

O código vigente tem portas fechadas deliberadamente para cadastro público/checkout/saques. Não marcar como concluído aquilo que está apenas testado; ciclo: corrigir -> verificar -> publicar no serviço existente -> conferir funcionalidade e banco reais. Se falhar, reverter ativação sem alterar dados. Não alterar `docs/CONTRATO_VISUAL_LOOP_APROVADO.json` sem autorização visual específica.

**Atenção:** os serviços estão atualmente pinados a commits específicos no Railway; commits posteriores na branch podem não ser publicados automaticamente. Atualizar os serviços existentes explicitamente quando necessário.


## Correção de regra — catraca comandada pelo relógio e por caixa previamente provisionado

**Decisão do proprietário em 17/11/2026, às 20h18 UTC — prevalece sobre a hipótese anterior de exigir seis vendas novas por centro no dia.**

- **Vendas:** geram receita e posições válidas; compra/indicação alimenta filas A/B e habilita qualificação. A compra não é disparador temporal obrigatório de cada luz futura.
- **Acumulação:** de **01/12/2026 a 01/01/2027** prevê-se aceitar vendas e posições habilitadas, **com a catraca parada**, enquanto o caixa é formado (somente após ativação e comprovação das integrações comerciais externas). Filas podem receber posições durante a pausa.
- **Programação diária, definida pelo operador:** o operador avalia o caixa efetivamente disponível e decide a **meta de centros por dia**. O número de janelas de luz é **seis vezes a meta**, distribuído ao longo de abertura/fechamento escolhidos, que **não mudam automaticamente**. A data é opcional. Meta zero mantém controle livre/sem meta. Exemplos para 09h–18h: 1 centro=6 luzes=90 min; 5 centros=30 luzes=18 min; 10 centros=60 luzes=9 min.
- **Regra financeira obrigatória de implementação:** uma luz/um giro **não pode inventar venda, receita, crédito nem saldo**. As liberações devem depender de **reserva/caixa real já conciliado e provisionado**, com disponibilidade rastreável, idempotência, livro-razão, travas de saldo/contingência e auditoria. O relógio determina **quando** progredir, não cria dinheiro, não opera em saldo descoberto e não contorna as exigências de parceiros externos. Se a provisão não for suficiente, o processamento bloqueia/pausa com motivo explícito; meta não é garantia incondicional de pagamento.
- **Correção técnica pendente:** o motor de ensaio em src/domain/motor-conta-unica-ensaio-sqlite.js, na função _processarMetaAgenda, **ainda condiciona cada luz a pedidos aguardando e à confirmação PSP individual**, o que **não atende** à decisão acima. Exige separar **entrada de novas vendas** da **autorização de ciclos já financiados**, desenhando uma nova ligação auditável ao livro financeiro real; **não publicar/ativar uma catraca que destrave pagamentos sem esta provisão real**. O ajuste de cálculo do intervalo na branch, isoladamente, **não conclui essa mudança de regra**.

**Estado de publicação neste registro:** a versão com apenas o cálculo da meta não foi promovida ao Railway por causa dessa divergência. A entrada comercial pública e pagamentos continuam bloqueados nas etapas externas.

## Separação definitiva — split da venda e distribuição financeira por luz

**Esclarecimento do operador em 17/11/2026, 20h38 UTC. NÃO confundir entrada de receita comercial com distribuição posterior por luz.**

1. **Venda e recebimento:** uma instituição captadora/distribuidora, ainda não contratada, recebe dinheiro real, concilia a liquidação, paga fornecedor, separa os R$ 250 destinados à conta LOOP conforme regra da operação e efetiva disponibilidade, e transfere a sobra comercial à outra conta designada, descontadas taxas, frete, tributos e demais custos. Cada repasse exige comprovante, idempotência, checagem de insuficiência e estorno; jamais presumir R$ 250 líquidos em toda venda.
2. **Catraca e distribuição:** as vendas alimentam filas e caixa acumulado; não abastecem cofres laterais na mesma hora. Após reserva de caixa previamente conciliado e autorização do operador, as luzes comandam o destino de cada parcela. São seis luzes por centro, sem exigir seis compras novas. A ordem do ciclo NORMAL no motor é CENTRO, ESQUERDA, CENTRO, DIREITA, CENTRO, ESQUERDA; centro dourado da empresa segue regra integral própria para cofre dourado.
3. **Contemplação gradual:** primeira luz pode mostrar avanço e parcela prevista do centro; luz acesa, direito apurado, crédito sacável, transferência entre contas e Pix pago são estados separados, com prova/auditoria própria. Não anunciar valor disponível antes da validação financeira.
4. **Status verificado:** o roteamento está no domínio destino-financeiro-centro-loop; o livro de luzes candidato ainda associa a compra e é proibido em produção; portas-financeiras-modulares são contratos sem banco conectado; controle-caixa-catraca-loop-sqlite só autoriza luz operacional contra comprovante de reserva, sem movimentar banco nem acionar motor; livro-financeiro-real-sqlite exige prova externa para lançar créditos. O split bancário e o repasse real por luz AINDA NÃO ESTÃO INTEGRADOS.

**Invariante por modo:** VENDA -> liquidação e split comercial -> caixa LOOP conciliado -> autorização de caixa e evento -> LUZ -> lançamento destinado ao centro/cofre -> crédito/saque após prova. No PROGRAMADO, a meta e a reserva acumulada autorizam o ritmo independentemente de novas vendas. No LIVRE, nova venda liquidada pode disparar imediatamente a próxima luz usando a parcela corrente dessa venda, sem tocar nas reservas exclusivas do programado. Nenhuma venda credita cofre lateral sem existir luz efetivamente autorizada; luz não fabrica receita. Preservar telas existentes.

## Esclarecimento adicional — modo LIVRE versus PROGRAMADO (17/11/2026, 20h41 UTC)

- **LIVRE ativado explicitamente pelo operador:** não espera cronômetro, meta ou horário de luz agendada. Quando chega nova **venda qualificada e efetivamente liquidada**, a venda cria posição/alimenta fila, concilia o repasse ao LOOP e, **se o tabuleiro e as travas financeiras permitirem**, dispara imediatamente a **próxima luz, somente um evento por venda**. A parcela nova vai ao destino dessa luz (centro ou lateral, conforme a sequência; douradas na regra própria). Uma venda não completa automaticamente as seis luzes. Não consome saldo anterior reservado para a agenda.
- **PROGRAMADO:** utiliza caixa previamente acumulado e reservado com prova; o operador define meta de centros, horário e data opcional; relógio controla quando ocorre cada luz, sem exigir nova venda naquele momento. Vendas recebidas durante a programação continuam criando posições e caixa novo, sem gerar alocação em duplicidade.
- **PAUSADO:** vendas qualificadas criam posições e abastecem filas/caixa, mas não acendem luzes nem distribuem para cofres laterais. Aplicável ao período de acumulação antes da liberação.
- **CONTABILIDADE:** 'não desconta dinheiro no LIVRE' significa 'não consome reserva anterior destinada ao PROGRAMADO', não ausência de lançamento contábil. Cada utilização da parcela recebida, reserva, estorno e crédito ao destino precisa ser registrada e conciliável; sem gastar a mesma entrada duas vezes.
- **META ZERO NÃO LIGA O LIVRE:** meta=0 é ausência de meta, não autorização para iniciar motor ou movimentar recursos. Modo PAUSADO permanece PAUSADO até ação explícita do operador.
- **SEGURANÇA:** disparar somente com prova da liquidação, parcela disponível e situação válida de fila/tabuleiro; se faltar prova, mantém pendente sem gerar luz/crédito fictício. Não prometer ganho incondicional. É necessário consentimento e prova da operação financeira.
- **ESTADO TÉCNICO:** esta é a regra de negócio a implementar. O modo livre financeiro ainda não está ligado ao motor transacional de produção e a fintech de distribuição ainda não está homologada. O registro desta regra não ativa repasses reais.
