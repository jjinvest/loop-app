# LOOP 3.0 / AKITEMM — Manutenção comercial auditável sem encerrar sessões de clientes

**Data:** 07/11/2026  
**Fonte:** GitHub `jjinvest/loop-app`, branch `feature/unificar-escritorio-real-20261105`. Conferir HEAD atual antes de trabalhar. PR #1 permanece DRAFT. **Código não implantado no ambiente comercial**, sem PSP de produção nem fornecedores homologados.

## Problema real eliminado neste bloco

O proprietário quer poder editar, reparar, migrar e auditar a plataforma enquanto clientes reais continuam acessando Escritório LOOP, Loja AKITEMM, histórico e pedidos em andamento — sem reiniciar o projeto nem apagar registros antigos. Era necessário um controle de emergência distinto da catraca e do motor.

Criado `src/producao/manutencao-comercial-sqlite.js` com um estado persistente no mesmo SQLite comercial:

- `suspensa=false` (padrão quando um banco começa vazio): operação comercial administrativamente normal, **não** libera automaticamente a venda real;
- `suspensa=true`: **novos** pedidos, emissão de cotações e edições do catálogo, preços e custos são rejeitados sem afetar o login, os pedidos existentes e a leitura das informações;
- atualizações usam `BEGIN IMMEDIATE`, revisão concorrente esperada, um conjunto fechado de motivos (não aceita CPF, nome, tokens, senhas ou texto livre no histórico), e evento `MANUTENCAO_COMERCIAL_ALTERADA` na cadeia HMAC; **se o registro de auditoria falhar, a alteração do estado é revertida**;
- mudança e reabertura passam pela sessão independente do operador, verificação de origem HTTPS, token CSRF e rota `/api/admin/comercial/manutencao` (GET/POST). Visitantes e clientes não conseguem acionar;
- tela administrativa aprovada reutilizada com **Suspender novas operações**, **Retomar novas operações**, **Atualizar situação** e motivo pré-definido. A trava só se aplica ao subsistema comercial, nunca ao giro/tabuleiro nem a saques e cofre do LOOP;
- o catálogo, alterações de preço e custo e a gravação de novas cotações/pedidos conferem a trava dentro de `BEGIN IMMEDIATE` quando necessário, impedindo corrida entre o botão de suspensão e a criação de uma nova operação;
- o recebimento de PSP e a finalização de pedidos **já iniciados e pagos** não param automaticamente: preservar direitos do cliente e manter a reconciliação. Expedição ainda exige prova de pagamento e liberação de custo do distribuidor.

**Auditoria em escala:** em `src/producao/auditoria-operacional-sqlite.js`, a verificação completa passou a usar cursor `iterate()` em vez de carregar todas as linhas com `.all()`. Foi removido o limite padrão oculto de 100 mil eventos; qualquer limite de varredura é opcional e explícito. A verificação da cadeia continua completa, e uma assinatura inválida impede novos registros. A auditoria assinada ainda não possui ancoragem externa imutável; isso faz parte da futura prova de operação real.

**Recuperação:** a tabela de estado `loja_real_manutencao_comercial` foi incluída no snapshot de backup cifrado de identidade/admin. O modo suspenso sobrevive à recuperação; **restaurar um backup não reabre vendas automaticamente**. Cópia e restauração offsite da empresa ainda dependem de configuração e prova externa no ambiente definitivo.

## Procedimento operacional para manutenção com clientes em produção

1. Pelo Escritório Administrativo autenticado, consultar **Auditoria**, estado da manutenção, últimos pedidos e comprovação do backup/restore atual. Não começar uma migração se a cópia de dados comercial-financeiros não estiver protegida.
2. Se a alteração puder afetar pedidos novos, escolher **Correção técnica** ou **Incidente operacional** e clicar em **Suspender novas operações**. A tela mostra a confirmação e a revisão. Confirmar que novas compras e edições foram bloqueadas; contas, pedidos já pagos e acompanhamento continuam.
3. Aplicar a correção em commit versionado, com migração **aditiva** ou compatível; testar integridade, concorrência, idempotência, recuperação e funcionamento com dados históricos. Não editar saldo, cotação, CPF, compras ou cadeia auditável manualmente.
4. Homologar a alteração em ambiente separado, verificar o backup e a disponibilidade externa e só então autorizar a mudança produtiva em janela controlada. Registrar commit, responsável, impacto, prova e plano de retorno.
5. Após provas operacionais, escolher **Retomar operações**. Conferir o status persistente, integridade da auditoria e retomada de cotações/pedidos novos. Se a falha persistir, **manter a trava** e preservar os dados.

**Limite da entrega:** este procedimento não substitui versionamento de esquema/migrations, rollback automático de deploy, monitoramento produtivo, ancoragem de auditoria em outro sistema, backup transacional conjunto de PSP/pedidos/financeiro ou homologação externa. A arquitetura para manutenção comercial está preparada e testada no GitHub; não afirmar que um checkout comercial de verdade já pode vender.

## Evidência

- [CI completo — bloqueio de novas vendas, edição de preços/custos, retomada e isolamento administrativo](https://github.com/jjinvest/loop-app/actions/runs/42354515362) — sucesso.
- [CI completo — auditoria streaming sem teto artificial](https://github.com/jjinvest/loop-app/actions/runs/42354698314) — sucesso.
- [CI completo — estado de suspensão restaurado no SQLite](https://github.com/jjinvest/loop-app/actions/runs/42354756748) — sucesso.

**Continuidade de outras IAs:** consultar `docs/HUB_CONTINUIDADE_MARCO_ZERO_07NOV2026.md`, `docs/LEIA_PRIMEIRO_LOOP_30_INDICE_VIGENTE.md` e `docs/COMANDO_MESTRE_LOOP_03_CONTINUIDADE.md` e depois o HEAD da branch. Preservar qualquer commit novo de outros chats/Work antes de editar. Sem merge/deploy de produção ou abertura de vendas neste bloco.
