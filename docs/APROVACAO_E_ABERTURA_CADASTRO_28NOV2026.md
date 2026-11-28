# Aprovação dos documentos e abertura de cadastros — 28/11/2026

Base verificada: `2a20d4eb454a59ab5b8c894b3e3f4ee71b4324a0`. O proprietário aprovou os Termos e a Política apresentados e autorizou abrir **somente os cadastros**, com as correções de apresentação abaixo. Essa decisão sucede o bloqueio de inscrição registrado na auditoria das duas frentes; não significa conclusão das demais pendências comerciais.

## Alterações autorizadas

- Remover os rótulos “Versão proposta” e “Escopo da versão”.
- Identificadores legíveis sem datas: `LOOP-TERMOS-CADASTRO` e `LOOP-PRIVACIDADE-CADASTRO`.
- Identificar os serviços como `LOOP 3.0 (Escritório Virtual)` e `AKITEMM (Loja Virtual)`.
- Preservar o restante dos textos, dados de atendimento e sete tópicos de cada documento.

A apresentação do cadastro e das leituras desses Termos não expõe a data do identificador técnico. Internamente a revisão passa a `LOOP-TERMOS-CADASTRO-2026-11-V2` e `LOOP-PRIVACIDADE-CADASTRO-2026-11-V2`, com novos hashes e aceites. Nenhum aceite de terceiros é marcado automaticamente. O Git preserva as versões anteriores.

## Configuração de abertura autorizada

Serviço `loop-identidade-real`, projeto `8c1ab327-16f0-409a-90ac-8f02a3f5eae0`, ambiente `e5c30d7f-086f-4845-93ad-7d1a5ca5e31b`, volume existente. Alterar somente:

| Variável | Valor de abertura |
|---|---|
| LOOP_REAL_CADASTRO_GO | SIM |
| LOOP_REAL_APROVACAO_DOCUMENTOS | SIM |
| LOOP_REAL_SNAPSHOT_V2_MIGRAR | NAO |
| LOOP_REAL_SANEAMENTO_LEGADOS | NAO |

As duas últimas encerram rotinas pontuais antigas incompatíveis com cadastro aberto; não apagam registros nem desfazem migração. Não alterar chaves, provedores, dados do volume, créditos, produtos ou integrações comerciais. O canal institucional VILELA já configurado permanece.

A escrita deve ser feita com skipDeploys e seguida da implantação da revisão aprovada, para não abrir cadastro com documentos anteriores. Backups e validação de restauração continuam obrigatórios; falha fecha o cadastro. Preparação interna e demais travas não são removidas.

## Critérios de comprovação

1. Testes de documentos, gates, regressão e navegador PC/celular aprovados.
2. GitHub com os arquivos corrigidos e conferidos por SHA.
3. Deploy da revisão correta com SUCCESS e provas de backup da identidade/mídia.
4. `/readyz` HTTP200 e cadastroAtivo=true; documentos públicos com textos e hashes da revisão aprovada.
5. Convite VILELA abre formulário com indicação preservada, termos e botão disponíveis, CAPTCHA existente e textos legíveis corrigidos.
6. Não preencher/aceitar termos/submeter conta de teste no ambiente público. A criação completa é validada nos testes isolados com o mesmo fluxo e será usada por pessoas reais após a abertura.

Não declarar abertura concluída apenas por variável gravada ou código mesclado. O resultado operacional da implantação deve ficar registrado na descrição da entrega GitHub, após leitura posterior dos endpoints e da tela pública.

## Recuperação conservadora

Se a abertura falhar, fechar novamente GO e APROVACAO_DOCUMENTOS juntos em NAO, manter SNAPSHOT_V2_MIGRAR e SANEAMENTO_LEGADOS em NAO, manter volume/chaves e corrigir o erro concreto. Não reativar limpeza de contas nem reiniciar dados para recuperar o serviço.

## Provas anteriores à implantação

Regressão: 1.791 testes aprovados, zero falhas/cancelamentos/ignorados. Navegador PC/celular aprovado, com identificação legível e cadastro por convite. Manifesto930 arquivos íntegros.

SHA256 abertura-comprovado.log: `acfd355f42d30c4cb6abba2181333859cfedf1935aa69e0ff792b89f34cfd0b3`.

SHA256 abertura-browser.log: `def28894c3375ae5b5bed62f109ebc8b141744b778354189f0e07c23ee0cfb2a`.

A sonda `scripts/provar-storage-real-preparacao.js` é mantida no pré-deploy com GO e APROVACAO_DOCUMENTOS em NAO somente no ambiente desse processo de prova. A configuração do serviço continua SIM/SIM. Isso permite conservar PUT/GET/hash/limpeza da sonda sem exigir o fechamento do cadastro em execução; não remove sua proteção nem altera backups existentes.
