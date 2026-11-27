# Recuperação fora do ChatGPT e retirada dos dados vivos

Procedimento documental 27/11/2026. Não executa aplicação, START, alteração de volumes ou publicação. Os inventários originais continuam em [INVENTARIO_INFRA_20261126.json](INVENTARIO_INFRA_20261126.json); não recriar manualmente valores secretos a partir de exemplos.

## A — Retirar agora o que já está pronto

1. Baixar `LOOP_PRESERVACAO_20261126.aesgcm` e `CHAVE_E_RECUPERACAO_LOOP_20261126.zip` pelos links privados entregues ao proprietário.
2. Guardar cópias em locais independentes desta conta, com acesso privado. Manter a chave separada do pacote e do dispositivo de backup. Não publicar chave no Git.
3. Baixar o complemento documental 27/11 ou clonar a branch `docs/preservacao-integral-20261126`; o pacote anterior permanece como checkpoint imutável.
4. Num computador autorizado com Node24 e Git, criar pasta NOVA. Extrair somente o kit e executar, adaptando caminhos locais:

```sh
node RECUPERAR_LOOP_30.cjs LOOP_PRESERVACAO_20261126.aesgcm chave-loop30.json NOVO_BACKUP.tar.gz
```

O programa confere tamanho/SHA256, autenticação AES e recusa destino existente. Confirmar o SHA256 do cifrado no recibo. Extrair TAR em pasta nova com ferramenta de arquivo do sistema, sem executar scripts do acervo.

```sh
git clone --mirror loop-fontes-consolidadas-20261126.bundle loop-recuperado.git
git --git-dir=loop-recuperado.git fsck --full
git clone loop-recuperado.git loop-trabalho
git -C loop-trabalho switch docs/preservacao-integral-20261126
```

Ler `COMANDO_UNIVERSAL_CONTINUIDADE_LOOP_30.md`. Essa restauração de fontes não requer ChatGPT/OpenAI, mas não restaura os bancos vivos. Não executar npm start, iniciadores, containers ou scripts históricos durante a leitura. A IA substituta recebe documentos e código locais, nunca o kit de chaves sem necessidade autorizada.

## B — Destravar o acesso Railway

Entrar em railway.com com a conta proprietária, escolher o workspace que contém `loop-asaas-homologacao`, projeto `8c1ab327-16f0-409a-90ac-8f02a3f5eae0`, ambiente `homologacao`/`e5c30d7f-086f-4845-93ad-7d1a5ca5e31b`. Se aparecer404/Login, conferir conta e workspace; não transferir projeto nem cadastrar outra empresa.

Abrir cada serviço e sua aba Backups para listar snapshots/data/estado, sem restaurar. O login do conector desta conversa não cria sessão no navegador ou na CLI. Senha,2FA e tokens ficam somente no fluxo seguro do proprietário, nunca em mensagem ou documentoGit.

Alternativa no computador autorizado do proprietário com CLI oficial instalada: `railway login`. Depois, inventário somente leitura dos volumes, conforme CLI oficial:

```sh
railway volume files --project 8c1ab327-16f0-409a-90ac-8f02a3f5eae0 --environment e5c30d7f-086f-4845-93ad-7d1a5ca5e31b --volume 003a1977-4139-4356-adbd-798fa6d1621b list / --json
```

Repetir a listagem para volumes `35cf49af-6f59-4663-9c74-770f8da71e8e` e `46c14a33-b40f-4b52-8e22-a355fb7d19eb`. A documentação oficial permite também baixar arquivos via `railway volume files ... download REMOTO DESTINO_NOVO`, mas usar isso só para arquivos já cifrados ou snapshots consistentes identificados; não baixar SQLite vivo isolado e chamá-lo backup.

[CLI volumes oficial](https://docs.railway.com/cli/volume) · [SSH/SFTP oficial](https://docs.railway.com/cli/ssh) · [Backups Railway](https://docs.railway.com/volumes/backups).

## C — Cópias de dados que ainda exigem execução

Após acesso, a equipe técnica deve enumerar TODOS os arquivos dos3 volumes/buckets, sem imprimir conteúdo pessoal ou segredos. Registrar caminho,bytes,data,versão e dependências de SQLite/WAL/SHM/mídia. Usar os mecanismos de snapshot consistente existentes para identidade/catálogo e procedimento próprio para `testes-modulos.sqlite` e legados. Exportar configurações completas para cofre privado do dono, com valores secretos separados do inventário público.

Nunca copiar só `.sqlite` enquanto há escrita, apagar WAL, modificar saldos, revogar chaves da origem ou reativar flags antigas de migração/saneamento/bootstrap para testar. Validar cada cópia com checksum, SQLite integrity_check, relações/contagens e prova de chaves/HMAC. Guardar objeto cifrado e manifesto autenticado fora da origem. Listagem de snapshot não prova restore.

Backups nativos Railway só restauram no mesmo projeto/ambiente segundo a documentação e a restauração exige deploy; isso não atende sozinho à independência portátil. Neste projeto não pressionar Restore/Deploy. Para prova de dados, usar ambiente isolado autorizado, sem rede financeira, jobs,webhooks ou bootstrap de contas; jamais montar o volume vivo.

## D — Reconstrução de infraestrutura

Primeiro recuperar fontes e dados OFFLINE, depois validar, e só então pedir autorização específica para criar/publicar infraestrutura. Reproduzir a topologia gateway→identidade e staging separado; mounts/regiões/tamanhos/comandos/âncoras estão no inventário. Preservar separação entre clientes.sqlite, catálogo/mídia e testes-modulos.sqlite. Volumes antigos permanecem intactos.

Chaves de cifragem/HMAC/código/e-mail/pedidos/outbox/backup precisam ser AS ORIGINAIS, entregues por cofre seguro do dono. Uma chave nova não decifra o acervo antigo. Recuperação DR existente exige manifesto assinado,pública/fingerprint confiável e provas; não remover gates. Nenhuma lista de nomes de variáveis substitui seus valores privados.

Validar relacionamentos, titularidade, mídia, livros e agenda sem executar eventos. Confirmar estado parado e plano de jobs antes de iniciar qualquer servidor. Só após autorização separada ligar rede, domínio,PSP,automação ou serviço. START continua decisão do proprietário. DNS/registrador e custódia externa não foram exportados nesta missão.
