# LOOP 3.0 / AKITEMM — Backup OFFSITE real do SQLite único (06/11/2026)

## Concluído em homologação
- A prévia privada Railway `akitemm-escritorio-preview` conserva o **mesmo SQLite /dados-preview/escritorio.sqlite** para conta, loja, pedidos, conciliação Asaas Sandbox, posições, aceites e auditoria. O serviço `asaas-webhook-staging` e seu volume separado continuam preservados, sem falsa migração ou fusão de dados.
- Bucket privado Railway já existente `loop-backup-offsite`, no ambiente `homologacao`, região IAD; volume SQLite da prévia em SFO. **Não houve criação de novo bucket, serviço ou compra**.
- Implementado o backup diário no MESMO processo da prévia, com opt-in `LOOP_PREVIEW_BACKUP_OFFSITE_AUTO=SIM`, só em homologação. Executa uma cópia inicial ao iniciar e programa novas rodadas a cada 24h. Impede sobreposição de backups e espera a conclusão ao parar o processo.
- Algoritmo: `VACUUM INTO` captura snapshot consistente do SQLite sob WAL, valida `integrity_check`, `foreign_key_check` e vínculos, cifra com **AES-256-GCM**, chave derivada por **scrypt** de uma senha distinta derivada via HKDF do segredo-raiz da prévia; a chave nunca vai para GitHub, logs, HTTP ou frontend.
- O S3 privado Railway recebe arquivo `.loopbak` com chave de objeto exclusiva, via URL SigV4 `PUT` não sobrescritível, gera `GET` de volta, compara tamanho e SHA-256 do conteúdo cifrado, e executa restauração SQLite **num diretório temporário isolado**, incluindo revogação de sessões no banco restaurado. O banco original NÃO é sobrescrito.
- Endereços `GET /staging/escritorio-unificado/backup-offsite/estado` e botão de conferência no **painel de auditoria existente** exibem sucesso somente depois da confirmação de upload, download e restauração; sem expor segredos, URLs assinadas, dados pessoais ou caminhos internos.
- A configuração do serviço Railway usa **REFERÊNCIAS PRIVADAS** para as credenciais já emitidas pelo bucket:
  `LOOP_BACKUP_S3_ENDPOINT`, `LOOP_BACKUP_S3_BUCKET`,
  `LOOP_BACKUP_S3_ACCESS_KEY_ID`, `LOOP_BACKUP_S3_SECRET_ACCESS_KEY`,
  `LOOP_BACKUP_S3_REGION`.
  O segredo-raiz existente continua a base da derivação da chave de restauração.
- **Prova real registrada no Railway:** deployment `08a7dc2a-7039-4ecf-b224-1d73e61f8f62`, branch `feature/unificar-escritorio-real-20261105`, commit `c40f8784d79497f97ac896d68d08d53d8d24e9a3`, status `SUCCESS`. Log literal **`LOOP_BACKUP_OFFSITE=CIFRADO_ENVIADO_BAIXADO_E_RESTAURADO`** depois de montar o volume e iniciar a prévia. Isso comprova uma cópia offsite funcional na homologação, **não** simulação de rede.
- Testes unitários/HTTP do backup incluem URI e assinatura SigV4, envio cifrado, download, restore, detecção de adulteração, tolerância a erro, controle de concorrência, parada e botão do administrador. CI de integração + Chromium PC/celular: verificar run vigente da branch.

## Limites que não podem ser confundidos com conclusão do Marco Zero
1. A primeira cópia REAL e a restauração isolada **foram comprovadas**; ainda não foram observados 24 horas de execução automática, nem prova de recuperação da aplicação em **outro serviço/região/provedor**. Não marcar RPO/RTO e recuperação de desastres como contratualmente garantidos.
2. O backup depende do **segredo-raiz da prévia** para recuperar a chave de criptografia. A perda desse segredo inviabiliza a leitura das cópias antigas. Antes de produção, exigir custódia/escrow independente do segredo, procedimento de rotação e teste de recuperação com ambiente limpo.
3. O limite programático do arquivo cifrado é **512 MiB** e o volume Railway atual da prévia é **1 GiB**; isso NÃO é uma promessa de clientes infinitos. É necessária estratégia de escalabilidade/migração de banco, política de retenção e teste de carga antes do lançamento comercial.
4. Os backups atuais contêm dados de homologação. Asaas **Sandbox**, verificação de identidade comercial, fornecedores/frete/impostos, financiamento real, cofres/saques e enquadramento jurídico-contábil continuam bloqueios independentes.
5. A PR #1 permanece **DRAFT**; sem merge ou cobrança real. O relatório de restauração não autoriza qualquer operação financeira.

## Evidências no código
- `src/domain/s3-url-assinada-backup-lab.js`: S3 SigV4 mínimo do bucket privado.
- `src/domain/agendador-backup-offsite-railway-lab.js`: periodicidade, serialização, prova de upload/GET/restore e controle de erro.
- `scripts/servidor-escritorio-preview-railway.js`: usa **o mesmo SQLite** e vincula o bucket real por variáveis Railway.
- `scripts/backup-criptografado-checkout-staging.js` e `scripts/validar-backup-offsite-checkout-staging.js`: implementações anteriores reutilizadas; não há pipeline paralelo.
- `test/agendador-backup-offsite-railway-lab.test.js` e testes de servidor/navegador.


## Saúde operacional do backup — correção no bloco de continuidade
- A cópia histórica verificada continua registrada sem ser apagada por falhas futuras, mas o estado novo `backupAtualEmDia` só é verdadeiro quando a última tentativa terminou com restauração comprovada e a confirmação tem no máximo 26 horas. Uma falha posterior ou envelhecimento tornam o estado atual **não saudável**, sem falsificar o sucesso histórico.
- O botão de conferência do Administrador usa a validade atual em vez de mostrar sucesso antigo como atual. O endpoint mantém a evidência histórica separada, sem vazar dados pessoais, chaves ou URLs.
- Teste `test/agendador-backup-offsite-railway-lab.test.js` inclui cópia boa, envelhecimento acima de 26 horas e falha posterior com objeto adulterado. O teste focalizado passou no job de homologação de `bd6caef322a05e3164badacfeb6707a45f4b2a70`; a validação geral e navegador devem ser conferidos no mesmo run antes de considerá-lo concluído.
- A correção não ativa Asaas Sandbox, não prova recuperação inter-regional nem altera o status financeiro do Marco Zero.
