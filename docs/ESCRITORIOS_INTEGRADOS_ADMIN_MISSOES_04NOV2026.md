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
