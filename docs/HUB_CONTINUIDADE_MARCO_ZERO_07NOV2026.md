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

## Próxima prioridade independente da WeDrop

Terminar trilha/auditoria e manutenção do **administrador real** com CI sem regressões; adicionar evidência operacional para edições com rollback/backup de emergência; preparar rotinas de suporte e reconciliação de custos/pedidos para o contador; depois executar homologação de administração em ambiente isolado com autenticação externa, sem liberar checkout produtivo. A aparência de cliente fica preservada até decisão separada de UX.

**Este documento é portátil (Markdown no GitHub).** Os detalhes deste chat não devem ser o único registro da arquitetura, pendências ou decisões. Sempre levar novas decisões ao índice e ao documento-mestre, com o link deste HUB.
