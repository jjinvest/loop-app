# LOOP 3.0 / AKITEMM — recuperação offsite em contêiner isolado — 06/11/2026

**Resultado: prova real de recuperação em laboratório, PARCIAL para o gate G5.** Nenhuma operação comercial, pagamento real, saque ou lançamento foi habilitado. PR #1 permanece DRAFT.

## Escopo e arquitetura

- **Origem:** aplicação `akitemm-escritorio-preview`, ambiente `homologacao` no Railway, SQLite persistente em volume único `/dados-preview`, com uma posição criada pelo teste Pix Asaas Sandbox da seção 238.
- **Backup:** o agendador existente grava instantâneo SQLite consistente com WAL, cifra em AES-256-GCM e envia para S3 privado de homologação; ele já realiza download e restauração temporária no processo principal.
- **Nova prova externa independente do processo principal:** `scripts/medir-restauracao-offsite-preview-railway.js` executou num **contêiner de predeploy separado**, sem volume SQLite original. Fez consulta HTTPS somente de leitura ao motor da instância ativa; listou os objetos S3 de homologação via GET assinado SigV4; escolheu o objeto mais recente do dia pela data de modificação; baixou somente por GET assinado, com limite de 64 MiB; descriptografou em diretório efêmero 0700; restaurou a cópia em arquivo novo SQLite; validou integridade, chaves estrangeiras e identidade da conta; e comparou a quantidade de posições recuperadas com a instância original. Os arquivos temporários foram apagados ao fim.
- Os testes `test/medir-restauracao-offsite-preview-railway.test.js` impedem execução em produção, contra domínio alternativo, sem permissão explícita ou com chave incorreta, bem como listagem parcial do S3. **Nenhum objeto foi sobrescrito; nenhum PUT, cobrança, webhook ou escrita no volume original ocorreu neste ensaio.**

## Resultado medido em infraestrutura real

Deploy Railway de ensaio: `8999177b-757a-4f3c-8e49-2be0222fb5c4`, **SUCCESS**, com healthcheck aprovado. Log do predeploy `LOOP_DR_OFFSITE` confirmou:

| Verificação | Resultado |
| --- | --- |
| Objeto remoto S3 legível com credencial de homologação | **PASSOU** |
| Descriptografia e restauração isolada em novo SQLite | **PASSOU** |
| Número de posições na instância ativa | **1** |
| Número de posições no SQLite restaurado | **1** |
| Verificações de integridade SQLite / vínculos no restore | **PASSARAM** |
| Idade da cópia escolhida | **14 minutos** |
| Tempo TOTAL deste ensaio de consulta, download, descriptografia, validação e restauração | **2 segundos** |
| Escritas no banco original / dinheiro real | **0 / não** |
| Recuperação independente de outra região/provedor | **NÃO comprovada** |
| RPO/RTO contratual garantido | **NÃO comprovados** |

Os números de 14 min e 2 s são **uma amostra pontual**, não SLAs nem piores casos. A comparação cobre quantidade de posições e integridade semântica do snapshot; não foi executada auditoria posterior de login com titulares reais, nem prova de restore sob falha de região, corrupção simultânea ou indisponibilidade do próprio provedor S3. A rotina criptográfica da restauração invalida sessões no novo banco, mas esta execução não é uma prova externa de reautenticação ponta a ponta.

## Estado posterior e gates

Após a prova, o opt-in temporário `LOOP_PREVIEW_OFFSITE_DR_TESTE` foi definido como `NAO`, e a **execução DR foi retirada do predeploy normal**; suas regressões permanecem na verificação. A branch da prévia fica fixada no commit `a8ec13aafd1153e0120d7a86f25baabc1baaeb3b`, sem tocar na PR #1.

- **G5: PARCIAL** — upload/recuperação externa via S3 e restauração em contêiner separado comprovados para o SQLite da homologação. Ainda faltam validação em outro domínio de falha/região e ensaios repetidos sob volume maior, medição observada de RPO/RTO sob falha de verdade, retenção e política de chaves.
- **G3: PARCIAL** — o estado foi persistido após reinício em ensaio anterior; faltam interrupção em transação PSP, replay real do mesmo webhook e escrita concorrente.
- **G6–G10: ABERTOS** — conformidade, segurança independente, fornecedores/checkout de produto, análise legal do incentivo e cobertura financeira seguem impeditivos do lançamento comercial.

**Regra de evidência:** prova de recuperação técnica não é prova de solvência econômica nem autorização para publicidade de rendimentos.
