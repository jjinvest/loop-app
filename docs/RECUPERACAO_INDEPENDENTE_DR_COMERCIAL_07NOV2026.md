# Recuperação DR independente — LOOP 3.0 / AKITEMM — 07/11/2026

## Entrega técnica / limite da prova

Após a seção 252, foi implementado o recuperador READ-ONLY (src/producao/recuperacao-independente-offsite.js), um executor separado (scripts/provar-recuperacao-independente-identidade.js) e testes (test/recuperacao-independente-offsite.test.js).

O procedimento consulta um objeto S3 SOMENTE por GET, em ambiente isolado, exige MANIFESTO CONHECIDO separado do objeto, valida tamanho e SHA-256 ANTES de decifrar, restaura em arquivo temporário sem substituir o banco ativo, valida SQLite, chaves da identidade, cotações, pedidos e outbox quando presentes, e HMAC administrativo. As sessões são revogadas no restauro; remessas INDETERMINADO NÃO são reenviadas; pasta temporária removida; relatório sem PII nem credenciais.

O retorno força FALSE para custodiaExternaIndependenteComprovada, recuperacaoOutraRegiaoComprovada, conciliacaoPspBancoComprovada e financeiroRealHabilitado. O código, CI e uma segunda pasta temporária **não atestam implantação efetiva em outra região/conta**, nem existência de segredos independentes.

## Manifesto out-of-band

O produtor enviarBackupOffsiteIdentidade retorna agora manifestoIndependente com chaveObjeto, sha256Cifrado, bytes, contas, pedidos, linhasCustos, remessas, cotacoes, administracaoIncluida e recuperacaoComercialIncluida. Guardar este manifesto em sistema de custódia DIFERENTE do bucket de dados e verificar autoria/integridade por processo externo. O JSON não contém CPF, nome, e-mail ou segredo. O manifesto por si só não tem assinatura criptográfica.

## Procedimento em ambiente externo autorizado

1. Preparar instância com Node 24 em conta/região realmente separada, sem montar nem copiar o volume vivo; cofre de chaves sob administração separada; credencial de bucket de preferência limitada a s3:GetObject. Registrar identidade/região da instância e do cofre para auditoria.
2. Depositar o manifesto previamente custodiado em arquivo local absoluto fora de /dados-reais e /dados-preview e fora do serviço original. Definir LOOP_DR_MANIFESTO_ARQUIVO com esse caminho.
3. Injetar por cofre de segredos (jamais em GitHub/chat/prints) LOOP_DR_S3_ENDPOINT, LOOP_DR_S3_BUCKET, LOOP_DR_S3_ACCESS_KEY_ID, LOOP_DR_S3_SECRET_ACCESS_KEY, LOOP_DR_S3_REGION (opcional) e LOOP_DR_CHAVE_BACKUP, LOOP_DR_CHAVE_EMAIL, LOOP_DR_CHAVE_CIFRA, LOOP_DR_CHAVE_CODIGO. Adicionar LOOP_DR_CHAVE_AUDITORIA, LOOP_DR_CHAVE_COTACOES, LOOP_DR_CHAVE_PEDIDOS e LOOP_DR_CHAVE_OUTBOX quando respectivas tabelas possuírem conteúdo. Chaves de dados são hexadecimal 64 caracteres.
4. Definir LOOP_DR_EXECUCAO_AUTORIZADA=SIM e executar: node scripts/provar-recuperacao-independente-identidade.js. Bloqueia se o host for rotulado como o serviço original (LOOP_REAL_CADASTRO_GO=SIM) ou prévia (LOOP_PREVIEW_EXCLUSIVO=SIM). Esses rótulos não constituem por si prova da independência.
5. Guardar relatório SEM PII, identidade do host, região, tempo observado, id/versão do objeto e manifesto autenticado em trilha externa imutável. Confirmar origem intacta; testar janela RPO/RTO e política de retenção em várias datas.

**Falha fechada:** objeto inexistente, HTTP não 200, bytes/hash divergentes, chave incorreta, esquema/contagens diferentes, payload adulterado ou trilha HMAC inválida são reprovações; não há POST, reenvio de remessa, crédito, saque ou alteração do motor.

## Provas e pendências

Testes do recuperador: GET-only; não tocar no SQLite vivo; manifesto inválido; hash, tamanho e contagens divergentes; chave de backup/identidade errada; falha de rede e limite de tamanho. O workflow de identidade real deve executar o teste Node24, incluindo syntax-check do executor. Registrar URL da CI somente após conclusão.

**Pendências reais:** executar em infraestrutura independente com custódia e atestação externas; reconciliação bancária/PSP/taxas/fornecedores/tributos/saques com evidência autorizada e parecer jurídico-contábil. O backup do SQLite comercial NÃO contém prova de liquidação bancária; backupFinanceiroConfirmado=false. Sem liberação de checkout, remuneração, saques ou merge da PR #1 DRAFT.

Princípios: preservar UI aprovada, GitHub como fonte oficial, atualizar o HUB e o índice, e medir avanço por gate efetivamente fechado, não pela quantidade de testes.
