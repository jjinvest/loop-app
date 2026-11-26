# 16 — Backup e Recuperação

Captura documental: 26/11/2026. Base técnica `6e22deb194ec7f1cd1e0ce596cb1f3ed1f0e2f89`. Não altera regras nem certifica operação bancária.

Escopos independentes: (a) fontes/histórico Git com todas as refs anunciadas e bundle verificável; (b) documentação consolidada versionada; (c) bancos/mídia persistidos; (d) configuração sem segredos; (e) chaves sob custódia do proprietário; (f) automações; (g) arquivos/histórico pessoal fora do Git. Um bundle cobre(a), não cobre(c/e/g).

Código: mirror obtido da origem, fsck, bundle --all, sha 256, clone de restauração em pasta isolada e comparação de refs/blobs. Preservar refs originais e bundle consolidado posterior à documentação. Não executar checkout que inicialize serviços nem instalar dependências desnecessárias ao validar fontes.

Dados vivos: /dados-reais/clientes.sqlite e catalogo-produtos.sqlite têm mecanismos cifrados offsite existentes, com logs históricos PUT/GET/hash/restore observados. Isso não equivale a backup novo integral de todos os volumes. testes-modulos.sqlite, /dados-preview e /loop-staging precisam cópia consistente própria. Nunca copiar só o .sqlite ignorando WAL/SHM, sobrescrever destino ou alterar saldo para testar.

Recuperação existente: backup-identidade-real/offsite, backup-midia-offsite e recuperacao-independente-offsite. DR exige envelope de manifesto Ed 25519, pública/fingerprint confiável e chaves de dados originais. Chave privada do custodiante fica fora da origem/Git/CI. Não remover esses requisitos para obter sucesso aparente. Após restauro, conferir integrity_check, contagens, chaves/HMAC e estado dos eventos; revogar sessões e não reenviar outbox.

Cópia privada independente desta missão é pacote AES-256-GCM das fontes+documentação+inventários; arquivo de chave separado, nunca no GitHub. A custódia continua vinculada à conta atual até o proprietário baixar ambos e guardar em destinos seguros distintos. O formato, hashes, instruções e prova de recuperação constam no relatório. Dados vivos não obtidos não são incluídos nem declarados protegidos por esse pacote.

## Fontes integrais preservadas

- [RECUPERACAO_INDEPENDENTE_DR_COMERCIAL_07 NOV2026.md](../RECUPERACAO_INDEPENDENTE_DR_COMERCIAL_07NOV2026.md)
- [BACKUP_OFFSITE_SQLITE_UNICO_06 NOV2026.md](../BACKUP_OFFSITE_SQLITE_UNICO_06NOV2026.md)
- [RELATORIO_SQLITE_RECUPERACAO_BACKUP_21 OUT 2026.md](../RELATORIO_SQLITE_RECUPERACAO_BACKUP_21OUT2026.md)
- [Código: src/producao/backup-identidade-real.js](../../src/producao/backup-identidade-real.js)
- [Código: src/producao/backup-identidade-offsite.js](../../src/producao/backup-identidade-offsite.js)
- [Código: src/producao/backup-midia-offsite.js](../../src/producao/backup-midia-offsite.js)
- [Código: src/producao/recuperacao-independente-offsite.js](../../src/producao/recuperacao-independente-offsite.js)
- [Código: scripts/provar-recuperacao-independente-identidade.js](../../scripts/provar-recuperacao-independente-identidade.js)
- [Código: scripts/assinar-manifesto-dr-offline.js](../../scripts/assinar-manifesto-dr-offline.js)

[Voltar ao índice geral](README.md).


## Ampliação comprovada do acervo fora do Git

Foram identificados e materializados 139 arquivos relacionados ao projeto, incluindo artes, logos, banners, capturas e comandos históricos, sem substituir arquivos originais. Incluem as quatro referências visuais oficiais históricas. Cada arquivo tem tamanho e SHA256 no manifesto privado. Conteúdos e detalhes permanecem no pacote cifrado; não são publicados no GitHub. A preservação não reaprova imagens antigas e não executa scripts arquivados.

A busca por título não garante todos os anexos sem nome nem a mídia presente nos volumes. A história pessoal completa do ChatGPT continua para exportação posterior pelo proprietário. [Resumo de integridade sem conteúdo privado](PROVA_ACERVO_PRIVADO.json).
