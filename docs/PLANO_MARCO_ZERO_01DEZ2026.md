# LOOP 3.0 / AKITEMM — Plano de decisão para 1º de dezembro de 2026

**Criado em:** 01/11/2026. **Meta comercial proposta:** terça-feira, **01/12/2026**. São 30 dias após 01/11.
**Estado:** **META CONDICIONAL, NÃO É DATA DE INAUGURAÇÃO APROVADA.**
**Repositório:** `jjinvest/loop-app`; branch `fix/teste-escrita-catraca-20261014`; PR #1 DRAFT. Não fazer merge/deploy nem usar dinheiro real sem autorização formal.

## A distinção que decide a data

O CI e Chromium já aprovam o fluxo de laboratório. O servidor público `src/server.js` ainda **não** é o mesmo fluxo de produção do Escritório/loja/cobranças do laboratório; suas rotas de simulação ficam bloqueadas por padrão. Portanto, **suíte verde não equivale a checkout público homologado**.

O objetivo é ter plataforma **tecnicamente e juridicamente pronta para vender e atender consumidores reais**, com estoque/entrega dos fornecedores, liquidação demonstrável, regras de filas e expectativas comunicadas com clareza. Não simular disponibilidade financeira, não prometer ganhos por compras, nem ativar benefícios por evento não liquidado.

A decisão **GO** só pode ser tomada com documentação e validação independentes de **todos os seis gates** no Escritório; o painel de laboratório permanece `NAO_LIBERADO_PARA_DIVULGACAO`. **Uma data do calendário nunca destrava gate.**

## Caminho crítico por semanas

| Limite | Entrega obrigatória | Critério de saída | Risco de atraso |
| --- | --- | --- | --- |
| **07/11** | Arquitetura de produção definida, hospedagem/HTTPS, escopo comercial congelado; revisão jurídica inicial do modelo de compras, indicações, filas, CDC/LGPD e contratos iniciada | Responsáveis, impedimentos jurídicos, dados a custodiar e plano de infraestrutura explicitados | Sem viabilidade jurídica ou dono dos acessos, **não prometer venda em dezembro** |
| **14/11** | Serviço de compra/cadastro/checkout próprio de produção segregado do laboratório; Asaas **Sandbox remoto** homologado com pedido de R$250, titularidade fixa e webhook entregue pelo provedor a endpoint temporário autenticado | Evidência externa do envio remoto, reconsulta PSP, uma posição pendente e zero duplicações; exceções documentadas | Sem webhook ou caminho de produção definido, **meta de vendas em risco alto** |
| **21/11** | Staging real com HTTPS, acesso e sessão seguros, segredo segregado, backup criptografado/offsite, restauração em máquina separada, monitoramento e procedimentos de incidente; conciliação PSP/banco e saques sob aprovação independente | Testes E2E, fraude/replay, falhas de rede, encerramento inesperado, restauração com RPO/RTO medidos e parecer financeiro | Se staging seguro não estiver concluído, **substituir lançamento de vendas por pré-cadastro** |
| **27/11** | Regressão completa no candidato exato, aprovação visual do proprietário PC/celular, termos/privacidade/suporte/entrega/reembolso e contratos de fornecedores, parecer jurídico final | Todos os seis gates com evidência verificável, sem pendências críticas | **Qualquer gate faltante = NO-GO** |
| **28–30/11** | Congelamento do código, ensaio da operação, contingência/rollback, autorização escrita final | Decisão **GO/NO-GO** com responsáveis e evidências do SHA e ambiente exatos | Não autorizar em modo automático |
| **01/12** | **Vender apenas em caso de GO formal**; caso contrário, comunicação limitada a pré-cadastro/lista de interesse, desde que juridicamente aprovada | Segurança e direitos de consumidores preservados | Ajustar data sem simular prontidão |

## Evidências que não podem ser trocadas por números de testes

1. **CI exato da versão pública**: build reproduzível e Chromium completo no código realmente implantável.
2. **Asaas remoto**: webhook verdadeiramente **emitido pelo provedor**, assinatura/token, idempotência, reconsulta independente, reversão/estorno com revisão; somente Sandbox até autorização.
3. **Financeiro**: prova externa de liquidação, margens líquidas, provisões, cofre, riscos e saques; separar remuneração por indicação de receitas de venda. Nenhuma promessa de retorno.
4. **Produção/segurança**: autenticação real, HTTPS, rotas públicas com autorização, proteção de dados, monitoramento, backups offsite/restore, incidente/continuidade.
5. **Aprovação do proprietário**: telas e jornada real completas, pedidos/posições e condições comerciais em PC/celular.
6. **Jurídico independente**: análise da legalidade do modelo, inclusive risco de enquadramento como pirâmide, publicidade, relações de consumo, LGPD, tributos e direito a arrependimento/reembolso quando aplicável. **Este item pode impor redesenho ou impedir lançamento do modelo atual**.

## Regras de execução e dependências

- Desenvolver em blocos grandes; primeiro conferir HEAD e documentos, sem repetir auditorias já encerradas. Não aceitar `CI success` antigo como prova da versão atual sem conferir SHA.
- Work e chat comum não devem sobrescrever o mesmo arquivo enquanto trabalham em paralelo; reconsultar HEAD a cada atualização.
- Sem deploy, merge, pagamentos reais, saques, migração de dados pessoais ou publicidade com promessa de ganho sem autorização e evidência.
- O proprietário precisará disponibilizar **por fluxo seguro**, quando solicitado, suas aprovações e acessos de infraestrutura/Asaas, além de viabilizar avaliação jurídica/contábil externa; nunca colar chaves em chat ou GitHub.
- Se a data não permitir cumprir requisitos, a alternativa é **vitrine de apresentação/espera, sem compra ou acesso financeiro**, com peças revisadas. O primeiro dia de vendas deve ocorrer apenas quando os gates forem satisfeitos.

## Registro inicial de impedimentos, verificável em 01/11/2026

| Gate | Estado inicial | Por quê |
| --- | --- | --- |
| CI_HEAD_ATUAL | CI do laboratório aprovado; **produção não homologada** | Browser e suíte não cobrem versão pública que aceite dinheiro |
| ASAAS_REMOTO | **NÃO COMPROVADO na versão atual** | Webhook externo direto nunca foi recebido pela plataforma |
| BANCO_E_SAQUES | **NÃO COMPROVADO** | Simulações e provisões não são comprovantes bancários |
| PRODUCAO_E_SEGURANCA | **NÃO COMPROVADO** | Infra pública, restore offsite e monitoramento não aprovados |
| ESCRITORIO_VISUAL | **NÃO COMPROVADO pelo proprietário** | Capturas de teste não são aprovação final |
| JURIDICO | **NÃO COMPROVADO** | É necessária análise independente do modelo e das vendas |

**Próximo passo técnico do bloco:** reforçar a proteção de bootstrap público para impedir que flags de clientes de laboratório ou modo de simulação sejam usadas em `NODE_ENV=production`, com testes negativos, preservando a separação atual do checkout. Não confundir o bloqueio com a criação do backend de vendas real.

## Implementação pública incremental de 01/11/2026

**Contrato de orçamento implementado:** `POST /api/checkout/cotacao` consulta os mesmos produtos de `/catalogo`, recalcula quantidades e preços no servidor, rejeita parâmetros de cliente e produtos demonstrativos/ocultos, e devolve **somente estimativa informativa**, sem registro de pedido ou preço reservado. `GET /api/checkout/estado` informa o bloqueio. Todo endpoint para finalizar, criar pedido, pagar ou webhook permanece com **503**. `GET /health` mede vida do processo; `GET /health/ready` fica em **503** enquanto o Marco Zero não estiver homologado. Os seis gates externos são mantidos em `src/domain/marco-zero-gates.js` e reutilizados tanto pelo público quanto pelo monitor do laboratório.

**Evidência até aqui:** [CI da versão de orçamento](https://github.com/jjinvest/loop-app/actions/runs/41340343800): **731 testes aprovados, zero falhas**, Chromium PC/celular aprovado. O CI do refinamento de fonte única dos gates será registrado no documento-mestre após conclusão.

**Próximo caminho técnico:** modelar sessão de cliente e pedido durável na arquitetura pública **sem copiar as rotas fictícias**, criar integração Asaas exclusivamente Sandbox sob credencial controlada em staging externo, validar webhook remoto e cancelamentos com revisão; só depois desenhar o caminho de pagamento real, sujeito às autorizações e ao jurídico. Este avanço **não** libera checkout ou anúncios de venda.


## Rascunhos duráveis de staging — 01/11/2026

Preparação feita em `src/domain/intencoes-checkout-sqlite.js` e `src/routes/rascunhos-checkout-staging.js`: snapshots imutáveis com preço calculado no servidor, idempotência atômica por titular em SQLite, listagem isolada, simulação de duas contas, proteção de origem local, hooks obrigatórios de autenticação e antifalsificação (CSRF), replay após mudança de catálogo, persistência depois de reiniciar o SQLite e teste simultâneo de 12 requisições com a mesma chave. **O adapter de staging não é montado no servidor público; ele recusa uso em NODE_ENV=production.** Nem o rascunho nem a cotação conferem direito a posição, pagamento ou reserva de preço.

**O que realmente falta na parte pública:** substituir os adaptadores de identidade e CSRF fictícios por autenticação e gestão de sessões de produção auditadas; atribuir vínculo durável a titular verificado e cadastro/termos; modelar a transição de rascunho para pedido comercial real, com preço e entrega reconfirmados; prover checkout Asaas Sandbox em staging com webhook autêntico, antes de qualquer cobrança real. O código de staging é preparação de testes, não substituto de checkout de produção, e não deve ser habilitado por flag.

**CI e critérios finais:** registrar separadamente o run do código validado, o SHA exato e as evidências de navegador no documento-mestre. O Marco Zero continua NÃO LIBERADO para vendas até cumprimento verificável dos seis gates externos; 01/12 permanece data-alvo condicional.

## Sessao staging integrada ao pedido — 01/11/2026

A camada local de rascunhos agora possui ensaio HTTP com identidade derivada por scrypt, sessão SQLite persistida com hash do token, CSRF, isolamento dos rascunhos por titular, logout, expiração e bloqueio temporário de tentativas incorretas. [CI 741/741 PASS + navegador](https://github.com/jjinvest/loop-app/actions/runs/41342261523). O módulo é intencionalmente **não montado em `src/server.js`** e o cookie local não utiliza `Secure` por funcionar apenas em HTTP loopback; não habilitar em domínio público.

**Caminho crítico seguinte, sem atalhos:** definir provedor/infra de autenticação e HTTPS, dados e consentimentos mínimos, política de senha e recuperação, cookies `Secure`, limites de rate distribuídos, gestão de segredos e auditoria; depois transição transacional de rascunho para pedido comercial e integração autorizada Asaas Sandbox **remota** em staging. Sem esses pontos e sem gates financeiros/jurídicos, não há GO para compras reais em 01/12.

## Prepedido imutavel em staging — 01/11/2026

O fluxo `login de ensaio → rascunho SQLite → prepedido rastreável` agora esta implementado e [validado no CI 745/745, com Chromium PC/celular](https://github.com/jjinvest/loop-app/actions/runs/41344576557). O serviço reconsulta preços e dados do catálogo antes de preparar, recusa fotografia desatualizada, isola as contas e armazena um único prepedido imutável por rascunho mesmo com concorrência. Status `AGUARDANDO_HOMOLOGACAO_EXTERNA`, **sem checkout, sem reserva, sem pagamento real ou geração de posições**. O backend público continua bloqueado com HTTP 503 e esse módulo não é montado em produção.

**Decisão GO/NO-GO inalterada:** próxima frente depende de infraestrutura HTTPS de staging e integração Asaas Sandbox externa, seguida de validação de autorização/CSRF de produção, pedido comercial e logística. Sem demonstração remota real, reconciliação bancária/saques, segurança de produção, revisão visual e jurídico independente, o Marco Zero de 01/12 permanece uma meta não aprovada.

## Ponte de Pix Sandbox apos o prepedido — 01/11/2026

**Fronteira implementada no codigo, SEM habilitar vendas:** `PontePrepedidoAsaasSandboxStaging` registra a preparacao por titular + prepedido, valor do snapshot e referencia `LOOPLAB-hom-UUID`, e reserva o estado `CRIACAO_INDETERMINADA` em SQLite **antes** de qualquer POST Sandbox. Enviar exige `execucaoLiberada:true` e adaptador `AsaasSandboxLojaV6` explicitamente injetado. Se ocorrer timeout, nao repete POST. `AsaasSandboxLojaV6.localizarCobrancaPorReferencia()` e `PontePrepedidoAsaasSandboxStaging.recuperarCriacao()` fazem apenas GET por referencia para recuperar a ligacao com o pagamento remoto; recusam duplicidade e divergencia de valor/cliente/Pix. Nova reconsulta independente valida status e registra a historia imutavel, com `RECEIVED_IN_CASH` bloqueado. O GET opcional do prepedido no **staging local** projeta o status salvo, sem rede e sem divulgar segredo do PSP.

**NADA disto libera beneficio financeiro:** o modulo nao inicia automaticamente nem converte status Sandbox em pedido pago/posicao/saldo/saque. `src/server.js` nao monta essa ponte e os endpoints publicos continuam bloqueados. Os testes CI usam apenas um `fetchImpl` totalmente fake, apesar de exercitarem o adaptador de rede real. Para evidenciar `ASAAS_REMOTO` faltam: ambiente HTTPS de homologacao sob controle do proprietario, cliente e credencial **exclusivamente Sandbox** via gerenciador de segredos, criacao de Pix teste em execucao autorizada, entrega remota autentica de webhook com reconsulta PSP por ID, integridade da posse do pedido por titular e registro de prova verificavel fora do fixture. Nunca inserir chaves em GitHub/chat. Todos os demais gates externos permanecem pendentes.

## Recuperação de avisos interrompidos — 01/11/2026

A caixa local de callbacks de pré-pedido agora distingue avisos pendentes, em processamento e em revisão, e permite identificar eventos deixados em `PROCESSANDO` após reinício. A operação de recuperação é **manual e autorizada**, exige idade mínima configurada (padrão de 60 segundos) e fica auditada em tabela imutável; move a notificação para `EXIGE_REVISAO`, sem gerar nova cobrança, criar posição ou chamar o PSP. Foi acrescentada uma superfície local de operação com autenticação/CSRF injetadas, fora do servidor público e recusada em produção. Um worker que retorna tardiamente não pode substituir o estado de revisão.

**Próximo bloqueio de homologação remota:** configurar um ambiente de staging HTTPS realmente acessível por callbacks do Asaas Sandbox, sob controle do proprietário, com segredos armazenados fora do GitHub e política de reconsulta/reentrega supervisionada. Este código apenas viabiliza revisão e auditoria no laboratório; não homologa callback externo nem libera o Marco Zero.


## Atualizacao de execucao — 03/11/2026

A trilha **Asaas Sandbox remoto → webhook HTTPS genuino → GET independente no mesmo SQLite Railway → uma posicao pendente ficticia** foi comprovada para **uma unica cobranca de R$ 250**, sem dinheiro real ou direito financeiro. Um subteste remoto de homologacao deixa de ser o bloqueio principal; **nao** basta para abrir vendas.

A preparacao de contas agora inclui cadastro de candidato a titular com CPF cifrado/HMAC, aceite explicito de versao de termos **ficticios de laboratorio**, sessao e CSRF, bem como vinculo 1:1 de conta de checkout ao Escritorio demonstrativo e leitura de prepedidos por titular na mesma base. Os testes nao significam que identidade/CPF foram validados externamente, que os termos sao legais ou que estas rotas estejam em producao.

Foi adicionado CI independente de seguranca, com `npm ci`, `npm audit`, testes de identidade/conciliacao e verificacoes negativas de `NODE_ENV=production`: pagamento publico permanece com HTTP 503. A infraestrutura Railway disponivel tem um unico receptor, uma replica, um volume SQLite de 1024 MB, sem bucket/offsite; restauracao independente e recuperacao operacional de producao seguem **nao demonstradas**.

**Risco juridico crucial:** o modelo comercial em que participantes recebem beneficios financeiros condicionados a novas compras ou entrantes requer analise independente de possivel enquadramento como esquema piramidal, mesmo com PDF ou produto. A politica generica 'sem devolucao' nao elimina direitos legais do consumidor (CDC). Ver `docs/ANALISE_JURIDICA_PRE_LANCAMENTO_MODELO_LOOP_03NOV2026.md`.

**Lista curta de gates impeditivos ainda nao homologados:** servidor de contas e checkout comercial sob HTTPS e custodia de credenciais de producao; confirmacao de identidade legal/CPF/termos; entrega fisica/digital e reembolso/chargeback; reconciliacao bancaria, provisoes e saques sob aprovacao; backup offsite restaurado/monitoramento/recuperacao; validacao visual do dono; parecer juridico/contabil independente e decisao GO escrita. A **data de 01/12 continua condicional**, sem prometer a clientes o funcionamento do modelo antes de todos os gates. PR #1 segue DRAFT.
