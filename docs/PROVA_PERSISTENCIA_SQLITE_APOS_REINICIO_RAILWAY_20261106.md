# LOOP 3.0 / AKITEMM — prova externa de persistência após redeploy Railway — 06/11/2026

**Ambiente:** `loop-asaas-homologacao / homologacao / akitemm-escritorio-preview`. Exclusivamente laboratório (sem pagamento real, saque, direito econômico ou operação comercial).

## Procedimento e provas

O ensaio Pix Sandbox anterior foi bem sucedido e deixou **uma posição de teste pendente** no volume SQLite do Escritório Unificado, com identificação da pessoa preservada apenas no banco (não nos logs).

Foi implementado o comando read-only `scripts/provar-persistencia-reinicio-preview-railway.js`, que consulta via HTTPS com autenticação:
- `GET /readyz` — integridade semântica do banco de ensaio;
- `GET /staging/escritorio-unificado/motor/estado` — lê filas, tabuleiro e giro, verifica números únicos, gera **fingerprint SHA-256 truncado** sem titulares/CPFs/nicks;
- `GET /staging/escritorio-unificado/monitor-psp` — confirma conexão ao monitor do mesmo serviço e que **nenhum acesso de leitura dispara reconsulta PSP**.

Foram acrescentados cinco testes direcionados de integridade, proibição de produção, fail-closed e ausência de falso positivo sem posição anterior.

### Comparação antes/depois de reiniciar serviço

| Checkpoint | Evidência do Railway | Resultado |
| --- | --- | --- |
| ANTES | Deploy `08acdffd-bab7-474b-b50f-77fc365f22d9`, pre-deploy leu **instância anterior**; depois novo container com volume e healthcheck SUCCESS | `readyzApto=true`; `pspMonitorApto=true`; **posicoesMotor=1**, fila A=0, fila B=1, ocupadas=0; fingerprint **cf98e7a98991358737066b15** |
| DEPOIS | Redeploy `b024810a-764e-4198-8ffc-f6557fe24eb5` leu a **instância já reiniciada** do deploy anterior; SUCCESS com healthcheck | **EXATAMENTE** `posicoesMotor=1`, fila A=0, fila B=1, ocupadas=0; mesmo fingerprint **cf98e7a98991358737066b15** |

Prova objetiva: a posição e o estado das filas/tabuleiro persistiram no SQLite real do volume entre a substituição de containers; não foi gerada uma posição extra pela retomada. A saúde foi checada em ambos os deploys. O monitor PSP retornou no ambiente de ensaio, sem ações de escrita iniciadas pelo script. O token da conta, a chave Asaas, identificadores de PSP e PII **não foram registrados**.

**Importante:** o próprio script informa `comprovacaoReinicioCompleta=false` porque um único ensaio de reinício íntegro **não demonstra** recuperação sob falhas entre transações, replay de webhook, corrupção de volume, ou restauração remota do offsite. A comparação externa da dupla de deploys é a evidência complementar de persistência.

## Controles após a prova

O comando de leitura de persistência é removido do **pre-deploy normal**, para que eventuais limpezas autorizadas de dados de laboratório não impeçam futuras versões. Permanecem os testes de segurança, a validação Asaas somente GET e a auditoria da configuração do webhook. O serviço permanece fixado na branch `feature/unificar-escritorio-real-20261105` e em commit explícito; PR #1 permanece DRAFT.

## Gates

- **G3 — PARCIAL:** persistência de posição/estado após reinício comprovada; faltam replay real do mesmo webhook após interrupções, concorrência externa de escrita, falhas entre PSP e transação SQLite, reversões e reconciliação.
- **G5 — ABERTO:** não foi executada restauração offsite *independente* com medições de RPO/RTO nem prova de conservação dos históricos de PSP em ambiente restaurado.
- **G7–G9 — ABERTOS:** checkout comercial, fornecedores, conformidade legal, direito do consumidor e viabilidade econômico-financeira. Esta prova não autoriza anúncios de ganhos nem lançamento com captação remunerada.
