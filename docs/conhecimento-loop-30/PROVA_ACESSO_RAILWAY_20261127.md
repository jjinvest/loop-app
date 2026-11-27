# Acesso autenticado e retirada Railway — 27/11/2026

## Resultado comprovado
A autenticação segura GitHub → Railway foi concluída pelo proprietário. O dashboard mostrou o projeto loop-asaas-homologacao. O painel do volume identidade-real-sqlite abriu sem o erro 404 anterior. O login do navegador de trabalho está resolvido; não solicitar novamente que o proprietário faça login no próprio celular.

O inventário MCP posterior confirmou 3 serviços SUCCESS, 3 volumes, 2 buckets e nenhuma alteração staged. Nenhum deploy, START, restore, alteração financeira ou de configuração foi realizado.

## Objetos visíveis no painel
| Bucket | Caminho observado | Tamanho exibido |
|---|---|---|
| identidade-real-backup | clientes/2026-11-27/ae86442c-3e98-4d96-9010-2ac4f71a2347.looprealbak | 3 MB |
| identidade-real-backup | midia/2026-11-27/8213be32-cbed-4865-9678-43a8f57fee4b.loopmidiabak | 144 KB |
| loop-backup-offsite | staging/2026-11-18/251785ec-6c5e-4975-9ca4-d2c617e0f3e4.loopbak | 2 MB |
| loop-backup-offsite | staging/2026-11-18/71e02e7b-e046-49b0-9b73-99db176790df.loopbak | 2 MB |
| loop-backup-offsite | staging/2026-11-18/81575557-8242-461e-aef4-85f985b51e0a.loopbak | 2 MB |
| loop-backup-offsite | staging/2026-11-18/c8ae96a2-c97f-4220-827e-6f6065f97a4d.loopbak | 2 MB |

Pastas observadas: clientes de 15 a 27/11; midia de 18 a 27/11; staging de 06 a 18/11. As datas nos caminhos não comprovam o instante da captura ou consistência dos bancos. A listagem staging não exibiu pasta posterior a 18/11; não inferir que não haja cópias em outro local.
Bucket identidade-real-backup exibiu 329.5 MB; loop-backup-offsite 263.0 MB.

## Operações tentadas e erros
- Menu do arquivo de clientes → Download: primeira espera excedeu 30 segundos e reiniciou o kernel da ferramenta.
- Nova espera de download de clientes: `Timed out after 20000ms waiting for download.`
- Menu Download de staging/2026-11-18/251785ec-6c5e-4975-9ca4-d2c617e0f3e4.loopbak: `Timed out after 15000ms waiting for download.`
- Nenhum caminho de arquivo concluído foi retornado. Não registrar download, checksum de conteúdo ou recuperação desses objetos como executados.
- MCP list-service-backups com projeto, ambiente e serviço explícitos retornou: `The database tools are not enabled for this account yet.`
- WebMCP do painel: `No WebMCP tools are available in this document.`

Não foi apresentada recusa explícita de automação pelo Railway; timeout da ferramenta não prova bloqueio de bots, falha de autenticação, corrupção do backup ou indisponibilidade do site. A causa da ausência de evento de download permanece não determinada.

## Continuidade exata
1. Resolver retirada dos objetos por mecanismo oficial de exportação; não extrair cookies nem contornar valores secretos ocultados.
2. Preservar chaves originais separadamente e retirar cópias privadas criptografadas.
3. Validar hash e decifração conforme formato de cada arquivo, abrir SQLite em ambiente isolado, executar integrity_check/foreign_key_check e comparar inventário.
4. Enumerar e preservar todos os demais arquivos dos 3 volumes, inclusive testes-modulos.sqlite e volume legado. Não substituir cópia consistente por arquivo SQLite vivo sem tratar WAL.
5. Exportação integral ChatGPT, custódia externa do proprietário e recuperação fora desta plataforma continuam pendentes.

**Classificação: acesso autenticado CONCLUÍDO E COMPROVADO; inventário dos objetos PARCIALMENTE CONCLUÍDO; retirada e restauração dos bancos PENDENTES.**
