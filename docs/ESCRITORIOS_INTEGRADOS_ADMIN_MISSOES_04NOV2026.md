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
