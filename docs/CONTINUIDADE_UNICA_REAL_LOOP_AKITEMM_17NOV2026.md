# Continuidade da unificação interna LOOP / AKITEMM — 17/11/2026

## MARCO ZERO — contratos atuais prioritários (17/11/2026)

- [ESSÊNCIA DEFINITIVA — fluxo de venda, fintech, caixa, seis luzes, cofres e modos PAUSADO/LIVRE/PROGRAMADO](./ESSENCIA_DEFINITIVA_LOOP_FINANCEIRO_CATRACA_MARCO_ZERO.md). **Prevalece sobre hipóteses anteriores contraditórias; não implica ativação bancária.**
- [PROTOCOLO — como entregar uma cópia limpa e auditável do código do MARCO ZERO para outra IA](./PROTOCOLO_PACOTE_LIMPO_MARCO_ZERO_AUDITORIA_IA.md). O snapshot final será extraído somente do commit realmente concluído e verificado; o histórico original permanece preservado.


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
