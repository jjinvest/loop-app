# AKITEMM / LOOP 3.0 — Loja + Escritório do Cliente + Administrador
**Data: 04/11/2026.** Homologação local. PR #1 em DRAFT; sem merge, deploy comercial, dinheiro real ou liberação do Marco Zero.

## 1. Loja AKITEMM
Acrescentada na faixa superior dos filtros a legenda das **três classificações já existentes nos cartões**:
- Cinza — "Compra comum (sem LOOP)".
- Verde — "Qualifica para o LOOP" segundo regras de elegibilidade, confirmação e adesão.
- Dourado/roxo — "Evento especial", também sujeito às regras.
Somente acréscimo visual: bordas, cores, classificações, valor e lógica dos produtos não foram alterados. Uma ressalva esclarece que a cor não garante contemplação.

## 2. Escritório do Cliente
A aba "Meus Pedidos" recebeu "Comunicados sobre meus pedidos", consultados por sessão do titular. A consulta busca só mensagens vinculadas a pré-pedidos daquele titular no mesmo SQLite. Sem exibir missões administrativas de outros compradores nem dados pessoais.

## 3. Escritório do Administrador
Novo painel de homologação local em /staging/escritorio-admin e API protegida sob /staging/escritorio-unificado/missoes.
- Consulta dos pedidos e indicadores da mesma fonte do Escritório/loja.
- Campos: departamento, prioridade, título, instrução, pedido vinculado opcional e comunicado ao cliente opcional.
- Fluxo de missão: ABERTA → EM_ANDAMENTO → CONCLUIDA, ou cancelamento. Registro de nota a cada transição, histórico persistente e controle de revisão. Criação idempotente.
- Operações protegidas de laboratório reaproveitadas: reconsulta de evento Asaas Sandbox e preparação de entrega **fictícia**. O servidor precisa habilitar explicitamente operações Sandbox; sem isso, as rotas recusam o comando.
- Autorização de operador local com token fora de URL, cookies e armazenamento do navegador.

## Restrições
Missões nos departamentos POSICOES, FILAS, TABULEIRO, COFRES, SAQUES e outros são tarefas de operador, **não ordens que alteram automaticamente o motor**. O sistema não deve declarar ações humanas executadas até o operador registrar o andamento. Nenhuma missão pode confirmar pagamento ou movimentar dinheiro. O servidor candidato recusa ambiente production e não é montado no serviço público.

A operação definitiva exige autenticação de produção, perfis de permissão, proteção de dados, segundo fator, logs e backup offsite, infraestrutura HTTPS e validação jurídica independente. Os gates do Marco Zero continuam fechados.


**Validação concluída em 04/11/2026:** [navegador real PC/celular, loja + Escritório do Cliente + Escritório Administrador, criação de missão e comunicado sincronizado — SUCCESS](https://github.com/jjinvest/loop-app/actions/runs/41787540197). Capturas no [artefato de homologação](https://github.com/jjinvest/loop-app/actions/runs/41787540197/artifacts/13302031290). [Segurança e bloqueio financeiro — SUCCESS](https://github.com/jjinvest/loop-app/actions/runs/41786995505). O sucesso do ensaio local não autoriza lançamento comercial.


## 4. Evolução do Escritório do Administrador — departamentos e alertas PSP (04/11/2026)

A nova central operacional de homologação possui **12 departamentos**: CLIENTES, PEDIDOS, PRODUTOS, ENTREGAS, INDICACOES, POSICOES, FILAS, TABULEIRO, COFRES, SAQUES, SEGURANCA e OUTROS. Cada um exibe suas missões abertas e uma indicação explícita da cobertura atual. Para departamentos cujos dados comerciais ainda não estão conectados, o painel mostra **CONTROLE_MANUAL**, não saldo financeiro zero nem uma falsa conclusão operacional.

**Consultas e filtros de missão:** GET /staging/escritorio-unificado/departamentos mostra contagens reais do SQLite local de ensaio e pendências por departamento; GET /staging/escritorio-unificado/missoes recebe filtros validados de departamento/situação, página de 25 registros e navegação, evitando limitar silenciosamente o operador aos 50 primeiros. Todos exigem o segredo do operador, mesmo em loopback; nenhum desses caminhos foi montado no servidor público.

**Triagem de PSP:** GET /staging/escritorio-unificado/alertas examina páginas de 25 pré-pedidos e apresenta apenas aqueles com exigência de revisão ou webhook recebido sem reconsulta independente concluída. O painel indica explicitamente quantos pedidos foram examinados, não declara varredura global a partir de uma página. O botão POST /staging/escritorio-unificado/alertas/:prepedidoId/abrir-missao abre uma missão operacional PEDIDOS, com chave idempotente derivada do próprio pré-pedido. Pedidos sem alerta são recusados. A ação **não consulta PSP, não confirma pagamento, não cria posição, não altera saldo e não executa giro**. O operador precisa seguir a cadeia de comprovação já homologada antes de quaisquer benefícios comerciais.

**Provas:** teste de integração cobre bloqueio de rotas sem autorização, relatório dos 12 departamentos, cenário de cobrança Sandbox indeterminada por falha de rede simulada, criação de missão sem duplicação, filtros/limites de paginação e SQL/foreign keys íntegros, além da proibição de operações reais. Teste de navegador PC/celular cobre seleção de departamento, missões e comunicados sem redesenho aprovado.

**Ainda pendente:** controles concretos dos motores/caixas de produção, aprovação de operador segregada, catálogo de produção, conciliação externa, suporte real, execução automática autorizada e recuperação em infraestrutura externa. Nome de departamento e registro de missão não equivalem à integração do motor. PR #1 permanece DRAFT, sem merge, deploy comercial ou dinheiro real.


**Evidências do bloco 194, código a36db50b2e091a7eb7b9fcc72b48ce9f95b7421a (04/11/2026):**
- [Segurança e testes de departamentos — SUCCESS](https://github.com/jjinvest/loop-app/actions/runs/41788809596)
- [Navegador PC/celular com novos departamentos — SUCCESS](https://github.com/jjinvest/loop-app/actions/runs/41788809779)
- [Capturas do navegador](https://github.com/jjinvest/loop-app/actions/runs/41788809779/artifacts/13301439658)
- PR #1 DRAFT, ambiente local de homologação, sem vendas/saques/giro reais.


## 5. Integração funcional do catálogo de produtos (04/11/2026)

A evolução anterior de departamentos foi mantida. O departamento PRODUTOS agora apresenta a contagem do catálogo **publicado na mesma fonte usada pelo checkout de laboratório**, em vez de se declarar desconectado.

**Implementação no mesmo SQLite de laboratório:**
- Novo modelo src/domain/catalogo-admin-candidato-sqlite.js sobre o catálogo base de ensaio, com persistência de produtos adicionais e alterações de produtos existentes, validação dos campos pelo mesmo validador, controle de revisões, idempotência da criação e histórico protegido contra UPDATE/DELETE.
- Rotas exclusivas do operador: GET/POST /staging/escritorio-unificado/produtos; GET/PATCH /staging/escritorio-unificado/produtos/:id; GET /staging/escritorio-unificado/produtos/:id/historico. Campos editáveis: nome, descrição, preço de teste e estado de publicação. Tipo e entrega não são trocados após criação.
- Tela Administrador possui formulário com ID, tipo, nome, descrição, preço e estado; lista editável com revisão. Só o operador local autorizado pode gravar.
- GET /staging/catalogo fornece à loja apenas produtos PUBLICADOS, com dados públicos e sem segredos, CPF ou histórico interno. A aba de preparo do cliente foi conectada a esse catálogo: seleção de produto, quantidade, cotação e pré-pedido. A interface mantém o padrão visual aprovado.
- O adaptador compartilhado é o mesmo argumento passado à cotação do servidor candidato, aos rascunhos e ao preparo de pré-pedidos. Alterações de preço/estado refletem novas cotações. A fotografia do pedido já preparado permanece com o valor original; rascunho antigo **não pode virar pré-pedido** se o catálogo mudar, exigindo nova cotação. O laboratório continua sem Pix, vendas, giro ou direitos comerciais.
- As alterações são locais ao **candidato de homologação** e não atingem automaticamente a outra vitrine demonstrativa, a base comercial definitiva ou o servidor público. É necessário consolidar os módulos no futuro sem romper a segurança.
- Testes novos incluem persistência após reinício, controle de autorização, idempotência, conflito de revisão, bloqueio de alterações inválidas, histórico imutável, preservação de pedido anterior, recalculo da cotação e proibição de publicação comercial. O fluxo de navegador PC/celular também passa a criar um produto fictício no Administrador e preparar novo pré-pedido pelo cliente.

**Gate comercial:** nenhuma operação é de produção; o administrador local e o cliente são candidatos de homologação. O novo controle não ativa Asaas de produção, cadastro público, saques, posições ou benefícios. PR #1 permanece DRAFT, sem merge nem deploy comercial.
