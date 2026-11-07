# HUB DE CONTINUIDADE — LOOP 3.0 / AKITEMM — 07/11/2026

> **LEITURA INICIAL PARA QUALQUER CHAT, IA, DEV OU AUDITOR:** a fonte oficial é o GitHub, **não** memória isolada do chat. Antes de mexer, consultar o **HEAD mais recente** da branch `feature/unificar-escritorio-real-20261105` em `jjinvest/loop-app`, todas as alterações posteriores, o índice vigente e o documento mestre. Este arquivo é um mapa do momento, **não** substitui leitura do código atual. O projeto NÃO deve ser reiniciado.

## Missão, objetivo e limites

O proprietário quer **LOOP 3.0 + Loja AKITEMM completos e seguros para iniciar captação comercial em 01/12/2026**, não uma demonstração, uma contagem artificial de tarefas ou apenas testes verdes. Medição por **pendências reais eliminadas e operação completa**, em blocos grandes. Preservar telas de cliente aprovadas; foco técnico na operação e no administrador. Mensagens ao proprietário: apenas conclusões curtas e bloqueios que dependam realmente dele.

**Organização GitHub:** repositório `jjinvest/loop-app`, branch de integração `feature/unificar-escritorio-real-20261105`; branch histórica `fix/teste-escrita-catraca-20261014` e PR #1 permanecem **DRAFT**, **sem merge, sem deploy de produção ou pagamentos reais**. Nunca sobrescrever decisões, quebrar recursos aprovados ou desligar homologação existente para avançar. Ler também:
- `docs/LEIA_PRIMEIRO_LOOP_30_INDICE_VIGENTE.md` (índice)
- `docs/COMANDO_MESTRE_LOOP_03_CONTINUIDADE.md` (decisões históricas e vigentes)
- `docs/INTEGRACAO_FORNECEDORES.md` e `docs/WEDROP_START_PRIMEIRO_DISTRIBUIDOR_07NOV2026.md` (múltiplos distribuidores e restrições da WeDrop)
- `docs/CONTINUIDADE_CREDENCIAIS_ISOLAMENTO_07NOV2026.md` (identidade, infraestrutura, backup)
- `docs/PLANO_MARCO_ZERO_DEZEMBRO_BETA_JANEIRO_LANCAMENTO_2026.md` (gates históricos; refletir a meta atual do proprietário)

## Situação real das quatro frentes — não confundir CI com produção

| Frente | Evidência de código / avanço | Ainda **não** finalizado |
| --- | --- | --- |
| 1. Cadastro definitivo | Interface de cliente aprovada reutilizada em `src/producao/interface-aprovada-loop.js`; contas em SQLite, consentimentos/versionamento, e-mail, sessões distintas, recuperação e identidade separada de LAB; backup local e offsite preparado em código. | Implantação real segregada, chaves e bucket S3 privados, prova externa de restauração, domínio/Resend entregando e-mail, revisão de privacidade/segurança e go/no-go. |
| 2. Loja AKITEMM | Catálogo N produtos ↔ N distribuidores, cotação por estoque/preço/frete do parceiro, 1 compra com várias remessas, `Meus Pedidos` por titular, controle de preço e custo por oferta, margem bruta estimada e exports. | **WeDrop ainda NÃO integrada**; canal WeDrop Shopee Start restringe lojas a Shopee. Proprietário consulta suporte por loja própria/expedição autorizada sem upgrade; se não, usar outro distribuidor. Produtos/SKUs/frete/estoque reais, ERP/Bling autorizado e logística ainda não conectados. |
| 3. Checkout e financeiro | PSP Asaas Sandbox comprovado no LAB; pedidos comerciais imutáveis/SQLite, outbox idempotente por distribuidor e reconsulta de pagamento, comprovação separada do custo de mercadoria antes do envio, preço/custo congelados por venda. | Asaas produção, reconciliação bancária/tributária, notas fiscais, compras do fornecedor, devoluções e responsabilidades financeiras/jurídicas. **Nunca liberar dinheiro/posição por simulação.** |
| 4. Validação operacional | Homologação Railway protegida, CI Node/navegador, isolamento de visitante e operador, backup e recuperação com provas de laboratório, auditoria de alterações administrativas em desenvolvimento. | Operação real com PSP, e-mails, fornecedor, segurança/LGPD, suporte, carga, falhas e restauração completa (cliente + pedido + financeiro), critérios go/no-go e monitoramento. |

**WeDrop:** o usuário tem fornecedor/parceiro, não precisa procurar do zero. A captura do painel `Shopee Start` informa integração apenas de lojas Shopee. NÃO comprar upgrade de quase R$900 sem proposta e viabilidade. **Não tentar usar etiqueta da Shopee para pedido pago fora da Shopee sem autorização expressa.** O proprietário vai consultar o suporte; continuar autonomamente todas as outras frentes. Arquitetura N distribuidores deve ser mantida.

## Administrador funcional, manutenção e auditoria

**Implementações no branch (não declarar presentes no Railway LAB nem prontas para produção):**
- `src/producao/gateway-admin-comercial.js`: login administrativo independente dos cookies de cliente; CSRF e restrição de origem.
- `src/producao/sessao-admin-comercial-sqlite.js`: sessão administrativa hash em SQLite e limites de tentativas.
- `src/producao/interface-admin-comercial-aprovada.js` + `interface-admin-comercial-client.js`: conserva o visual/estrutura do admin aprovado e liga botões de **criar produto em rascunho, vincular distribuidor sem ativar, editar preço de venda, editar custo de aquisição e exportar CSV para contador**. Nenhuma rota abre venda só com cadastro do produto. Atenção: gestão completa de múltiplos departamentos e ações do motor ainda precisa ser ligada ao gateway real de forma segura.
- `src/producao/catalogo-multidistribuidores-sqlite.js` e `controle-economico-loja-sqlite.js`: preço e custo administráveis por produto/distribuidor, revisões concorrentes e histórico de mudanças; `pedidos-comerciais-sqlite.js` congela snapshot do preço/custo por venda (não apaga histórico quando o admin altera preço atual).
- `src/producao/rotas-admin-economia-akitemm.js`: APIs autenticadas exclusivas do admin, CSRF/origem, relatórios de preços/custos e vendas em CSV para o contador, separa **diferença bruta estimada** de lucro líquido e impostos (não calculados).
- `src/producao/auditoria-operacional-sqlite.js`: trilha **HMAC encadeada, append-only**, para criação de produto, vínculo de oferta, alteração de preço e custo. Operações registram na **mesma transação SQLite**; se falhar o histórico, a alteração é revertida. GET admin `/api/admin/comercial/auditoria` verifica a cadeia antes de exibir. Nenhum CPF, e-mail, token ou senha em eventos. Chave própria `LOOP_REAL_CHAVE_AUDITORIA` **não pode** ir ao repositório. **Esta trilha protege eventos administrativos do catálogo, NÃO cobre ainda todas as operações do motor, PSP ou saques.** Um root HMAC em SQLite não equivale a uma âncora externa imutável.
- `src/producao/backup-identidade-real.js`: inclui todas as tabelas administrativas e trilha de auditoria no mesmo snapshot de contas; recusa tabelas comerciais de pedidos sem mecanismo transacional completo; restauração revoga sessões de cliente/admin. O código de backup offsite real exige prova de upload, download, hash e restore, mas sem fornecedor de storage de produção configurado não é proteção comprovada em operação.

**Regra permanente de manutenção com clientes ativos:**
1. Alterações visuais não podem acionar dinheiro/tabuleiro; manter APIs/IDs aprovados e contratos estáveis. Preferir mudanças aditivas e revisões versionadas no banco, nunca migração destrutiva em horário comercial.
2. Alterações financeiras/motor exigem auditoria separada, replay/idempotência, provas de caixa coerente, tentativas concorrentes e rollback controlado. **Não corrigir registro histórico editando SQL manualmente**; usar eventos compensatórios com autorização e trilha auditável.
3. Antes do deploy, registrar descrição, riscos, migração, evidência e plano de reversão no GitHub; verificar backup + restore completo; CI não substitui prova externa.
4. Aplicar por gates e monitorar após deploy. Não alterar diretamente clientes reais, senhas, dados de entrega, reservas financeiras, contratos do distribuidor ou caixa sem controles autorizados. Falhas devem **suspender a operação afetada, não silenciar erro e continuar contabilizando**.
5. Tokens e segredos SOMENTE no provedor seguro, nunca GitHub, documentação, logs ou chat. Contas e rotas de ADMIN devem continuar inacessíveis ao cliente.

## Protocolo para outros chats e outras IAs

1. Abrir o GitHub `jjinvest/loop-app` na branch `feature/unificar-escritorio-real-20261105` e consultar HEAD/últimos commits/CI/PR (há desenvolvimento simultâneo em chats e Work). Preservar qualquer commit posterior a esta fotografia.
2. Ler este HUB, o índice vigente e o comando-mestre, e depois examinar os **arquivos de código das integrações a serem alteradas**. Não copiar documentação para código sem verificar a implementação; não voltar a branch anterior nem desfazer progresso.
3. Resolver **um problema operacional real por bloco** e conectar UI + API + persistência + controle de acesso + testes e logs; proibir falso dado de produção. Atualizar os arquivos pertinentes e registrar commits/evidência.
4. Não chamar uma etapa de 100% quando faltar operação externa, ambiente definitivo, aprovação jurídica/fiscal ou prova com fornecedor/PSP. Não criar listas artificiais com quantidade fixa de missões; medir o caminho crítico até o Marco Zero.
5. Ao encerrar um chat, gerar um **COMANDO DE CONTINUIDADE curto** com HEAD confirmado, CI mais recente, arquivos/documentos modificados e única próxima pendência, para permitir retomada em qualquer IA.

## Avanço comprovado em 07/11/2026 — manutenção comercial com clientes acessando

- **Pendência técnica corrigida:** o administrador possui o controle `Suspender novas operações` / `Retomar novas operações`, com motivo padronizado, sessão/cookie de operador exclusivo, CSRF, revisão concorrente, persistência em SQLite e evento HMAC atômico no histórico. O switch não cria venda, pagamento, saque ou mudança no motor do LOOP.
- **Somente o comercial afetado:** novas cotações, pedidos e edições de produtos, ofertas, preços e custos são rejeitados durante suspensão. Login dos clientes, visualização de pedidos já existentes e confirmação de pagamentos previamente iniciados continuam; expedição das compras já pagas segue submetida à prova de PSP e custo do distribuidor. Estado de manutenção é recuperado após backup cifrado/restore sem religar vendas acidentalmente.
- **Sem teto oculto de eventos:** a auditoria administrativa agora verifica a cadeia usando cursor streaming `iterate()`, sem limite padrão de 100.000 registros ou carregamento integral de linhas na memória. Continua verificando todas as assinaturas; ancoragem remota de raiz ainda pendente.
- **Arquivos-chave:** `src/producao/manutencao-comercial-sqlite.js`, `src/producao/auditoria-operacional-sqlite.js`, catálogo, preços/custos, cotações, pedidos, `src/producao/rotas-admin-economia-akitemm.js`, interfaces do admin, `scripts/iniciar-identidade-real-loop.js`, `src/producao/backup-identidade-real.js`. Provas em `test/manutencao-comercial-online.test.js`, `test/admin-comercial-integracao-operacional.test.js` e `test/backup-identidade-real-restauracao.test.js`.
- **CI mais recente comprovado:** [42354756748 — SUCCESS](https://github.com/jjinvest/loop-app/actions/runs/42354756748) (inclui pausa/retomada, cliente sem acesso às APIs admin, continuidade de operações previamente iniciadas, revalidação de cotação/pedido, persistência no backup/restore e auditoria streaming).
- **Manual portátil para outra IA/dev:** [MANUTENCAO_COMERCIAL_SEM_PARAR_CLIENTES_07NOV2026.md](./MANUTENCAO_COMERCIAL_SEM_PARAR_CLIENTES_07NOV2026.md).
- **Limites:** nenhuma alteração produtiva ou chamada real ao fornecedor/PSP. A integração comercial de produção continua pendente de fornecedor autorizado, PSP, e-mail, bucket externo, revisão jurídico-fiscal, testes de recuperação financeiro-comercial e comprovação em ambiente definitivo. PR #1 DRAFT, cliente visual preservado.

## Próxima prioridade independente da WeDrop

Terminar trilha/auditoria e manutenção do **administrador real** com CI sem regressões; adicionar evidência operacional para edições com rollback/backup de emergência; preparar rotinas de suporte e reconciliação de custos/pedidos para o contador; depois executar homologação de administração em ambiente isolado com autenticação externa, sem liberar checkout produtivo. A aparência de cliente fica preservada até decisão separada de UX.

**Este documento é portátil (Markdown no GitHub).** Os detalhes deste chat não devem ser o único registro da arquitetura, pendências ou decisões. Sempre levar novas decisões ao índice e ao documento-mestre, com o link deste HUB.

## Frente de recuperação comercial-financeira — 07/11/2026 (código/testes aprovados)

O backup AES-256-GCM de identidade/admin foi estendido para incluir **no mesmo snapshot transacional WAL** as tabelas comerciais opcionais de cotações, pedidos, custos congelados e outbox de fornecedores. Se pedido e custo congelado não coexistirem, ou se a outbox existir sem pedidos, o procedimento continua recusando cópias parciais. A verificação percorre todo o histórico e confere valores de venda com preços e quantidades congelados, status de pagamento, vínculos por titular da cotação e correspondência entre outbox, pedido, valor, PSP registrado e fornecedor. Snapshot de backup e arquivo restaurado passam pela mesma validação; sessões de clientes e administradores são revogadas na recuperação, e remessas INDETERMINADO continuam em revisão, **sem reenvio automático**.

**Limites indispensáveis:** preservar ciphertext não comprova posse futura das chaves de pedidos/outbox; PSP/banco/tributos, saque e todos os saldos definitivos ainda **não** são fontes conciliadas neste SQLite. O retorno backupFinanceiroConfirmado:false foi preservado de propósito. Não habilitar venda nem alterar o motor. Falta ensaio offsite em infraestrutura definitiva, custódia separada de chaves, reconciliação externa e recuperação financeira ponta a ponta. Código novo: src/producao/validacao-recuperacao-comercial.js + extensão de backup-identidade-real.js; testes no test/backup-identidade-real-restauracao.test.js. **CI de identidade, pedidos, backup e restauração aprovado:** https://github.com/jjinvest/loop-app/actions/runs/42359652669, commit de teste `8c9f0c92950f1eaef5ffafca4dd7b7fbc1a42e94`. Verificadas 25+ etapas no job, incluindo backup/restauração e manutenção. Não se confunde com prova offsite de produção ou certificação financeira.

## Recuperação externa: prova de chaves e trilha (07/11 — seção 252)

- **Implementado em código:** `src/producao/prova-chaves-recuperacao.js` confere custódia por HMAC da identidade (chaves de email/cifra/código), decifra TODOS os registros cifrados de identidade, cotações, pedidos e outbox presentes no SQLite isolado, confere hash da carga da remessa e percorre a cadeia HMAC de eventos administrativos. Não invoca PSP, não conecta fornecedor, não reenvia remessa, não modifica o banco original nem expõe dados privados.
- `src/producao/backup-identidade-offsite.js` exige equivalência do snapshot e restauro para contas, pedidos, linhas de custos, cotações, remessas e presença da administração. Na inicialização do serviço **real** (`scripts/iniciar-identidade-real-loop.js`), a prova criptográfica tornou-se obrigatória: sem as chaves efetivas de dados já existentes, o processo não aceita cadastros. Segredos opcionais de cotação/pedido/outbox precisam ser distintos dos demais e passam a ser exigidos pelo teste quando a tabela contém registros.
- O resultado separa `chavesDeLeituraVerificadas=true` de `custodiaExternaIndependenteComprovada=false` e `conciliacaoPspBancoComprovada=false`. Chave disponível no MESMO serviço não equivale a custódia independente. O backup cifrado não é conciliação de saldos/saques, NFs ou conta bancária; `backupFinanceiroConfirmado=false` permanece.
- **Prova CI:** [42364163850](https://github.com/jjinvest/loop-app/actions/runs/42364163850) SUCCESS (código `50e26be589554e8fc15005b54c2a955aea14716e`), incluindo teste offsite com pedidos/remessas e chave errada/missing. Regressão de adulteração HMAC aprovada no [run 42364281181](https://github.com/jjinvest/loop-app/actions/runs/42364281181).
- **Próxima pendência:** ensaio de desastre em outra instância/região com objeto baixado do armazenamento definitivo e cofre de chaves independente; em paralelo, adaptar provas PSP, extrato bancário, custo do fornecedor e conciliação de caixa, mantendo tudo fechado até evidências externas verificadas. Não houve integração financeira externa de produção neste bloco.

**Fechamento da trava de prontidão:** `src/producao/agendador-backup-identidade-real.js` exige, no fluxo de cadastro real, `chavesDeLeituraVerificadas=true` juntamente com upload/GET/restauro. Falha posterior derruba a prontidão, sem restaurar sessão nem abrir venda. Teste de GO sem chave comprovada e queda de prontidão aprovado no [run 42364379936](https://github.com/jjinvest/loop-app/actions/runs/42364379936), SHA `b80cd17f837930048528ea8f162a6cdb6f7119fd`. Próximo gate permanece externo: prova offsite com credenciais independentes, recuperação em outra instância/região e conciliação autorizada de PSP/banco/custos/tributos. Nenhuma prova bancária verdadeira neste bloco.

## Continuidade 253–254 — execução de DR isolada e comparação financeira (07/11/2026)

**253 — Recuperação DR a partir de objeto externo identificável.** Criados `src/producao/recuperacao-independente-offsite.js`, `scripts/provar-recuperacao-independente-identidade.js` e a suíte `test/recuperacao-independente-offsite.test.js`. O produtor de backup retorna agora `manifestoIndependente` com hash e contagens sem PII. Executor separado, somente GET S3, exige manifesto sob custódia independente, confirma tamanho/SHA antes de restaurar, revoga sessões, decifra registros do SQLite isolado, verifica a cadeia HMAC e remove temporários. **CI confirmado:** [42368153895 — SUCCESS](https://github.com/jjinvest/loop-app/actions/runs/42368153895). Procedimento operacional portátil: [RECUPERACAO_INDEPENDENTE_DR_COMERCIAL_07NOV2026.md](./RECUPERACAO_INDEPENDENTE_DR_COMERCIAL_07NOV2026.md). **Não foi executado em região/conta independente comprovada**; não atestar custódia externa, RPO/RTO nem backup produtivo.

**254 — Conferência cruzada de dados de pagamento (READ ONLY).** Criados `src/producao/conciliacao-financeira-externa-readonly.js` e `test/conciliacao-financeira-externa-readonly.test.js`. Comparador lê todos os pedidos aprovados e custos congelados, cruza registros PSP normalizados, lotes de crédito bancário e comprovantes por fornecedor, impedindo soma duplicada de repasses e distinguindo custo previsto de desembolso. Confere repetição, estorno, falha de titularidade, remessa INDETERMINADO, extrato ausente e despesas divergentes. **CI da implementação e testes:** [42368350406 — SUCCESS](https://github.com/jjinvest/loop-app/actions/runs/42368350406). Runbook: [CONVERGENCIA_DECLARADA_PSP_BANCO_FORNECEDOR_07NOV2026.md](./CONVERGENCIA_DECLARADA_PSP_BANCO_FORNECEDOR_07NOV2026.md). O código ainda recebe **fontes declaradas/mocks** e **NÃO está conectado** a Asaas produção, extrato bancário, despesas/notas reais ou contabilidade. Resultados aritméticos não autenticam fonte: `conciliacaoRealCertificada=false`, sem saldo/saque/comissão reais.

**Bloqueio operacional seguinte:** provisionar ambiente externo de recuperação com custodiante separado e executar prova observável; obter conectores **autorizados somente leitura** do PSP de produção e do banco e autorização dos fornecedores/contador para fechar o caixa, além de revisão jurídica/tributária independente. Nenhuma tela aprovada foi redesenhada, nem foi feito merge, deployment de produção, giro remunerado, saque ou cobrança comercial. PR #1 DRAFT. Conferir o HEAD/CI mais recentes antes de continuar, pois os links acima indicam execuções específicas, não aprovação do HEAD eterno.


## Continuidade 255 — assinatura do manifesto DR (07/11/2026)

Recuperador independente agora exige envelope Ed25519 e chave publica confiavel do custodiante, valida todos os campos antes de GET, rejeita documento sem assinatura, adulterado, algoritmo trocado ou chave errada. CLI DR exige arquivo de chave publica fora dos volumes de origem. Contrato no runbook RECUPERACAO_INDEPENDENTE_DR_COMERCIAL_07NOV2026.md. Custodia independente e recuperacao real em outra regiao continuam SEM PROVA; PSP/banco/fornecedor permanecem declarados; nenhuma autorizacao de operacao comercial. PR #1 DRAFT. Confirmar CI do commit antes de atestar cobertura.


## Continuidade 256 — autenticar a identidade da chave DR (07/11/2026)

O executor DR exige fingerprint SHA256/SPKI DER aprovado separadamente da chave PEM e do envelope. Nova ferramenta offline de custodiante assina manifesto fora da origem, com chave Ed25519 em arquivo privado 0600 e saída sem sobrescrita. Regressão exige rejeicao de fingerprint ausente/trocado, manifesto adulterado e operacao de assinatura não autorizada. Runbook RECUPERACAO_INDEPENDENTE_DR_COMERCIAL_07NOV2026.md atualizado. Sem prova externa da independencia do custodiante ou conciliacao bancaria; Marco Zero ainda bloqueado. CI da revisão requer verificacao.


## Continuidade 257 — auditoria de remessas sem falso zero (07/11/2026)

A conciliacao read-only foi reforcada contra remessa para fornecedor sem custo, pedido ainda nao aprovado, pagamento e valor de pedido divergentes, falta de ID parceiro e comprovante externo pago enquanto a outbox ainda indica PENDENTE. Ver docs/CONVERGENCIA_DECLARADA_PSP_BANCO_FORNECEDOR_07NOV2026.md. Sem conectores bancarios reais, sem certificar receita/caixa; nenhum deploy ou operacao comercial. Conferir CI da revisao no HEAD. Proximos gates continuam recuperacao externa com custodia e credenciais efetivas somente leitura.


## Continuidade 258 — estornos/reversoes de liquidacao (07/11/2026)

Auditor de caixa de tres fontes now contempla DEBITO_REVERSAO da conta bancaria ligado a transacao de credito original e lote, emitindo alerta obrigatorio mesmo se o liquido conciliar. Rejeita duplicacao e falso zero apos estorno. Testes em test/conciliacao-financeira-externa-readonly.test.js. Faltam conectores read-only PSP/banco, contrato com fornecedores, credenciais/custodia externas e evidencias juridico-fiscais; sem liberacao comercial, PR #1 DRAFT. Conferir CI desta revisao.


## Continuidade 259 — diagnóstico comercial Asaas sem habilitar dinheiro (07/11/2026)

Preparada consulta da conta Asaas Produção e capacidade de leitura do extrato, com allowlist explícita de dois GET, segredo de Produção distinto do Sandbox, validação da aprovação cadastral, opt-in manual e relatório sem valores/PII/IDs. Nenhuma chamada externa de Produção ocorreu porque não há credencial aprovada em runtime isolado. O banco externo segue sem instituição/contrato definido, WeDrop sem integração autorizada. Procedimento: docs/ASAAS_PRODUCAO_ACESSO_SOMENTE_LEITURA_07NOV2026.md. CI testa com respostas simuladas; verificar resultado no HEAD. Não habilitar checkout ou depositar chave no preview.
