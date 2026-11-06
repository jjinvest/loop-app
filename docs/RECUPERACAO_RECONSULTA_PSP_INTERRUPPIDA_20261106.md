# LOOP 3.0 / AKITEMM — recuperação de conciliação interrompida — 06/11/2026

**Escopo:** fluxo de homologação Asaas Sandbox, SQLite único de contas, loja, inbox, PSP e motor. **Status:** correção integrada e validada em execução de testes com SQLite persistido no contêiner Railway; não é teste de interrupção forçada de processo real em meio a transação PSP.

## Problema eliminado no fluxo

O trabalhador de reconsulta gravava `PROCESSANDO` antes do GET remoto. Se o processo encerrava após esse registro, a função de recuperação podia deixar o evento `EXIGE_REVISAO`, mas a conciliação automática não selecionava o caso e `processar()` devolvia o estado antigo, sem recuperar a execução. Assim, o dinheiro simulado tinha sido comprovado, mas a posição podia permanecer sem o vínculo do motor até intervenção manual.

## Correção integrada

- `src/domain/reconsulta-webhook-prepedido-asaas-staging.js`: a rotina já existente `recuperarTravados()` identifica checkpoints com mais de **120 s** de idade (chamador) em transação `BEGIN IMMEDIATE`, grava um registro durável de recuperação e move o evento para revisão recuperável. `processar()` agora aceita `retomadaSegura` exclusivamente para `PROCESSAMENTO_INTERROMPIDO_REVISAR` **com checkpoint auditado** e reinicia a reconsulta com o mesmo titular, pedido e pagamento. Todos os demais estados `EXIGE_REVISAO` permanecem bloqueados.
- **Proteção adicional de reincidência:** se uma retomada sofrer outra interrupção, ela vira `RETOMADA_REINTERROMPIDA_EXIGE_REVISAO` e não tenta automaticamente uma terceira vez, preservando a auditoria sem violar a chave única de recuperações.
- `src/candidato/servidor-loja-escritorio-candidato.js`: o mesmo lote usado pelo botão do administrador e pelo agendador chama o recuperador, inclui somente casos com checkpoint correto, reconsulta independentemente o PSP no Sandbox e chama a vinculação idempotente do motor pelo mesmo `prepedido_id`. A criação de posições depende das travas existentes de titularidade, reserva e PSP confirmado.
- `src/candidato/escritorio-admin-candidato-ui.js`: o **painel aprovado existente** passa a exibir reconsultas PSP em andamento, interrupções recuperáveis e reincidências que exigem intervenção. O resultado do botão de conciliação também informa casos detectados e efetivamente retomados. Nenhuma tela foi redesenhada.

## Evidência da aplicação

- Branch `feature/unificar-escritorio-real-20261105`, commit candidato `11f117e0495770bf620876902097c472a53c8c2a`.
- Railway `loop-asaas-homologacao`, deploy `48f78553-2f61-40ea-80bc-128e2b34710d`: **SUCCESS**, `healthcheck` aprovado, API do Asaas Sandbox consultada com sucesso e configuração do webhook validada por GET.
- `test/recuperacao-automatica-reconsulta-interrompida-sandbox.test.js` exercitou o fluxo real de SQL e transações, incluindo fechamento e **reabertura de arquivo SQLite persistente** com um evento deixado em `PROCESSANDO`, detecção, registro durável, retomada, nova consulta PSP controlada e confirmação de **um único evento de inbox**. Também demonstrou que divergência do PSP e segunda interrupção são bloqueadas, sem retry infinito nem criação de posição pela rotina do worker.
- Os demais cenários de prevenção de duplicações (seis webhooks HTTP controlados, mesmo Pix, uma posição) seguem documentados em `docs/PROVA_REPLAY_HTTP_WEBHOOK_ASAAS_SANDBOX_RAILWAY_20261106.md` e não foram reinterpretados como retransmissão do próprio provedor.

## Limites e próximas pendências

**Comprovado:** o defeito de recuperação automática pós-checkpoint foi corrigido no código, com persistência após fechar/reabrir SQLite, controle de reincidência e indicadores visíveis no escritório do administrador. A aplicação homologada sobe com a correção.

**Ainda não comprovado:** interrupção real do processo exatamente entre a chamada remota e o commit, replay originado pelo Asaas após HTTP 5xx, concorrência multi-instância sob escrita e exercício de carga transacional. **G3 permanece PARCIAL** até essas provas adversariais. G8/G9 (legalidade e cobertura econômica do modelo de remuneração) continuam bloqueando divulgação de ganhos e captação comercial.

Nenhuma operação financeira real, saque ou merge para produção foi liberado. PR #1 permanece DRAFT.

## Prova HTTPS da interface unificada

Além da prova do worker e do SQLite em disco, foi criado o verificador somente de leitura `scripts/verificar-painel-admin-recuperacao-preview.js`, que acessa **HTTPS autenticado da prévia ativa** para consultar o JavaScript que o navegador recebe, `GET /staging/escritorio-unificado` e `GET /staging/escritorio-unificado/monitor-psp`. A prova confere que o painel mostra os novos indicadores e que os dois endpoints devolvem **as mesmas contagens reais** de recuperação, sem publicar identificadores/segredos nem emitir POST.

O Railway registrou `LOOP_ADMIN_INTEGRADO` com `painelExistenteLigadoAoBanco=true`, `recuperacaoVisivel=true`, `backendEJanelasCoerentes=true` e `operacoesDeEscrita=0` no deploy `c629910f-15b0-42fe-83db-6a7d7c3cc23f`, que terminou **SUCCESS** com healthcheck. Candidato testado: `2eb8a779c1ab51b9782617d2a6619bbeb8d2acf8`.

Após a prova, a consulta externa ao painel foi retirada do **pre-deploy normal**. Isso evita que uma queda da instância antiga impeça a implantação de sua substituta durante uma recuperação. Permanecem as regressões locais de segurança e as sondas de acesso e configuração do Sandbox. As rotas do painel só permitem leitura autenticada.
