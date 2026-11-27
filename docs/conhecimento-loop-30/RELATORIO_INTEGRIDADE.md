# Relatório de integridade — preservação 26/11/2026

## Realizado e verificável

- Revisões GitHub/infraestrutura consultadas, sem modificar Railway/DNS/variáveis.
- Mirror de todas as refs anunciadas:297 referências,152 branches,0 tags,6.858 commits. Inclui refs dePR anunciadas; não inclui registros de comentários/reviews/issues por Git.
- Bundle integral verificado e restauração em repositório bare novo; comparação de todas as refs e gitfsck sem erros. Evidência legível: [PROVA_RESTAURACAO_GIT.json](PROVA_RESTAURACAO_GIT.json).
- Base capturada:1.734 arquivos,181 documentos originais preservados,917 caminhos de código/testes/workflows,486 declarações estáticas de tabelas. Zero binários de mídia rastreados por extensão nessa árvore; isso não significa ausência de imagens emSQLite, CSS, dados embutidos ou sistemas externos.
- 18 segmentos, porta universal, índice/ComandoMestre com ponte aditiva e Diário atualizado. Fontes integrais e histórico mantidos; mapa estático de tabelas não é dump do esquema instanciado.
- 43 testes específicos executados nesta missão,43 passaram,0 falhas: backup/restauro da identidade, offsite, mídia, DR e contrato visual. São fixtures isoladas, não recuperação dos bancos vivos.
- Trava real preservada:928 arquivos íntegros. Nenhum arquivo em src/script/public/test/.github/package foi alterado pela missão documental. Hashes visuais e âncora Railway não renovados.

## Evidência histórica observada, separada da execução nova

No deploybackend `7db15a89-4a20-48fd-b601-e8f1bc18b3f5`, inicialização 26/11 registrou LOOP_BACKUP_MIDIA_OFFSITE=COMPROVADO;PUT_GET_HASH_RESTORE=SIM e inventário de acervo. Não há cópia nova de todos os volumes nesta missão. A prova histórica não é atestado de backup financeiro nem garante retenção/RPO atual. Não houve acesso aos valores das chaves nem às contas bancárias.

## Bloqueios e escopos ausentes

| Operação / escopo | Resultado observado | Consequência |
|---|---|---|
| Abrir gestão de backups Railway no navegador | 404 Looks like you are lost, botão Login, sem sessão de projeto | Não foi possível exportar/restaurar nova cópia de volume |
| Exportação de volume/SSH pelo conector atual | Não há operação correspondente; fork_exec requer fork já existente e não é SSH livre na origem | Não criar ambiente que execute operação produtiva nem simular backup |
| Railway CLI local | `railway --version` retornou exit 127: `railway: command not found` | Sem sessão SSH alternativa comprovada |
| Listar automações Railway | Railway Automations is not enabled for this user. | ChatGPT foi inventariado separadamente:8 tarefas,4 ativas |
| DNS autoritativo/registrador/Cloudflare | Apenas status do domínio Railway disponível | Não exportado zonefile, titularidade ou credenciais |
| Mídia externa e história pessoal ChatGPT | Não integram o Git | Exportação posterior pelo proprietário |
| Banco testes-modulos.sqlite | Fora do backup de identidades pelo desenho existente | Precisa cópia consistente própria, não foi obtida |

## Cópia independente e custódia

O pacote privado cifrado desta missão contém bundleGitintegral e documentação/inventários; NÃO contém bancos vivos/segredos de produção. Chave deAES 256 GCM em arquivo privado separado, jamais no GitHub. Hashes finais, localização privada e prova dedecifração ficam no recibo entregue ao proprietário, fora do Git, evitando autorreferência dehash.

Cópia cifrada e kit separado foram salvos no armazenamento privado do proprietário. O pacote foi relido e seu SHA256 conferido. O proprietário deve baixar pacote e chave eguardá-los separadamente antes de abandonar aconta atual. Isso não transfere contas nem garante custódia em outra jurisdição/região.

## Validação e continuidade

[Validação por outra IA sem histórico](VALIDACAO_CONTINUIDADE.md) deve conter parecer efetivamente realizado, correções e limites. Revisão por agente de mesma plataforma não é auditoria humana independente nem DRentre contas. Publicação na branch ativa/merge/deploy dependem de autorização específica. Conhecimento documentado éportável; preservação integral deconversas, dados vivos e mídiaexterna permanece parcial.


## Ampliação comprovada do acervo fora do Git

Foram identificados e materializados 139 arquivos relacionados ao projeto, incluindo artes, logos, banners, capturas e comandos históricos, sem substituir arquivos originais. Incluem as quatro referências visuais oficiais históricas. Cada arquivo tem tamanho e SHA256 no manifesto privado. Conteúdos e detalhes permanecem no pacote cifrado; não são publicados no GitHub. A preservação não reaprova imagens antigas e não executa scripts arquivados.

A busca por título não garante todos os anexos sem nome nem a mídia presente nos volumes. A história pessoal completa do ChatGPT continua para exportação posterior pelo proprietário. [Resumo de integridade sem conteúdo privado](PROVA_ACERVO_PRIVADO.json).


## Finalização comprovada do pacote

[Prova criptográfica e de recuperação](PROVA_PACOTE_CIFRADO.json): AES-256-GCM, decifração idêntica, adulteração rejeitada,139 arquivos externos com hashes iguais, Git restaurado com300 referências e6.861 commits sem erros. O pacote durável foi relido e seu SHA256 coincidiu. Snapshot documental incluído:`600206e696f2c6da590bc0b8c2919c22a99ca0bc`; esta prova é posterior e não altera o produto. Kit de recuperação testado; destino existente rejeitado sem sobrescrita.

Pacote, chave separada e recibo foram salvos privadamente para o proprietário. Nenhum segredo foi adicionado ao GitHub. Ainda é necessário baixar ambos antes de abandonar a conta atual; os bancos vivos continuam fora do pacote.
