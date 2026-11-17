# PROTOCOLO — PACOTE LIMPO DO MARCO ZERO PARA OUTRA IA

> Decisão do proprietário em 17/11/2026: quando a plataforma estiver integralmente pronta para o marco de operação, gerar **um código limpo, íntegro e autossuficiente**, que possa ser entregue a outra inteligência artificial para check-up independente **antes da ativação de dinheiro real**. Criar a extração só após comprovação dos critérios abaixo. **Não confundir este protocolo com um pacote já gerado ou auditado.**

## Objetivo

Entregar a implementação **atual e consolidada**, a partir de um commit exato do MARCO ZERO, **sem histórico de tentativas, fotos antigas, prévias abandonadas, laboratórios obsoletos, código quebrado, arquivos temporários, credenciais ou dados pessoais de clientes**. Não exportar a trajetória da construção como se fosse parte da plataforma. Não apagar a trajetória do repositório original: deixá-la preservada em seu histórico e documentos de continuidade, separada do snapshot limpo.

## Entregáveis quando houver liberação

1. **MARCO_ZERO_CODIGO_LIMPO.zip** — somente os fontes vivos, a árvore de dependências realmente usada, versões travadas (lockfile), HTML/CSS/JS/ícones/imagens **atuais aprovados**, migrações ainda indispensáveis, scripts de inicialização, exemplos de configuração **sem segredos**, Dockerfile e demais arquivos exigidos para compilar, subir e operar. É o projeto que outra IA recebe como produto consolidado.
2. **MARCO_ZERO_AUDITORIA_INDEPENDENTE.zip** — a mesma revisão de código mais suítes essenciais de teste, contratos e invariantes, prova de restauração de backup sem dados reais, inventário de APIs e esquemas, testes negativos de dinheiro fictício, relatório de dependências, histórico de decisão sintético e lista verificável de pendências externas. Não precisa trazer meses de logs, telas antigas ou transcrições.
3. **MANIFESTO_MARCO_ZERO.json** — commit/tag exatos, data, hash SHA-256 de cada arquivo, versões de Node e pacotes, serviços/entrypoints, configuração não secreta, número de testes aprovados, gates explicitamente fechados/abertos, certificado de inexistência de credenciais no arquivo, e resultado de restauração em ambiente isolado.
4. **ESSENCIA_DO_NEGOCIO.md** — cópia da especificação vigente em docs/ESSENCIA_DEFINITIVA_LOOP_FINANCEIRO_CATRACA_MARCO_ZERO.md, mais contratos de filas A/B, papéis, políticas de compra qualificada, segurança e operação, escritos de modo que a segunda IA possa verificar **código versus regra**.

## Método de extração — não quebrar a plataforma

- Congelar **o commit realmente implantado e verificado**, criar tag/ramo de release `marco-zero` identificável, nunca usar uma prévia desatualizada ou um HEAD aleatório. A tag não ativa pagamentos.
- Gerar um **snapshot sem a pasta .git**, sem dados da história e com **lista positiva de dependências** obtida de entrypoints reais (loja, identidade, escritório, operador, catálogo, armazenamento, motor, relógio, filas, contabilidade, acesso e recuperação). Não excluir arquivo apenas por seu nome antigo, se ainda for uma dependência efetiva; primeiro substituí-lo e comprovar execução idêntica.
- Consolidar arquivos duplicados e substituir chamadas antigas por implementações atuais antes da extração. Gerar arquivos novos a partir do código vigente, **sem refazer o sistema do zero** nem alterar fluxos aprovados.
- Preservar exclusivamente artes/fotos atuais usadas pela interface; excluir mídia antiga não referenciada, mantendo licença e integridade das artes oficiais. Nunca remover molduras, catálogo, upload, dados operacionais ou funções porque pareçam 'sobras'.
- **Nunca incluir** segredos, tokens, .env reais, certificados privados, senhas, bancos SQLite com clientes, e-mails, CPFs, telefones, saldos, chaves de backup, snapshots de produção, volumes Railway, logs com PII ou dumps bancários. Incluir `.env.example` saneado; documentação de quais integrações requerem credenciais.
- Executar análise de dependências, busca por referências quebradas, npm ci/rebuild, testes funcionais/integrados, validação estática, restauração isolada e navegação autenticada PC/celular com dados sintéticos; verificar equivalência de rotas, telas e comportamentos entre o produto publicado e a cópia limpa.
- Conferir todos os arquivos do snapshot contra manifesto de hashes e varrer segredos. Abrir um ambiente isolado para a segunda IA: **somente leitura**, sem acesso aos bancos, chaves ou ações bancárias reais. A IA externa deve poder emitir diagnóstico e reproduzir testes, não aprovar dinheiro automaticamente.
- Preservar o repositório original, migrações de produção e rollback/continuidade para manutenção futura com clientes ativos. O snapshot limpo é um **produto de auditoria e eventual nova base de desenvolvimento**, não justificativa para apagar a infraestrutura original.

## Critérios para declarar pronto para extração

- Todos os três pilares registrados pelo proprietário: **infraestrutura interna**, **acabamento visual aprovado**, **integrações externas** claramente classificados, com pendências explicadas. O pacote pode ser criado antes de dinheiro real entrar, mas a certificação da liquidação bancária só pode ser efetivada **quando o provedor/contas permitirem provas autênticas**.
- Fluxo completo confirmado na aplicação real: link -> loja -> cadastro/login autorizado -> pedido -> posição -> fila A/B -> centro -> seis luzes -> destinos financeiros -> extrato -> solicitação de saque (esta última só habilitada quando externamente homologada). Bloqueios externos devem estar explícitos e não simulados como sucesso.
- Testes de PAUSADO, LIVRE e PROGRAMADO; metas 0/1/5/10; mudança de horário, data opcional, giro sem vendas novas no programado **mas com reserva provada**, livre com compra conciliada; contabilização sem dupla alocação; bloqueio por estorno/saldo insuficiente e por queda de PSP; douradas; fila/limite de posições; recuperação após restart.
- Garantir consistência e continuidade das contas e vínculos migrados sem recriar titulares, posições ou créditos; aprovação das imagens atuais por comparação; upload real do operador verificado com reinício/redeploy; backup/restauração e hash íntegro; testes de segurança e acesso independente do operador.
- Não afirmar '100% sistema real' quando estiver faltando a autorização financeira e a verificação de provedores. É possível declarar 'código interno preparado para integração externa' com gates fechados e evidências concretas; distinguir essas duas certificações no laudo.

## Checklist mínimo a solicitar à IA independente

1. Verificar se tudo o que roda em produção está no pacote, sem imports/assets faltantes, e reproduzir compilação, testes, migrações e recuperação de dados sintéticos.
2. Seguir uma venda de ponta a ponta e conferir o split fornecedor -> caixa central LOOP -> saldo comercial, e em seguida cada luz do centro até o destino efetivo — **sem confundir previsão com dinheiro liquidado**.
3. Provar que o LOOP não credita cofres laterais por simples venda, nem exige venda nova no PROGRAMADO, nem consome reserva programada no LIVRE; verificar PAUSADO e sequência CENTRO/ESQUERDA/CENTRO/DIREITA/CENTRO/ESQUERDA.
4. Auditar riscos de saldo duplo, corrida de webhooks, estorno, duplicação de posição, permissões, manipulação de tempo, dados pessoais, disponibilidade, rollback e recuperação de backups.
5. Entregar um laudo **aprovado / reprovado / não verificável**, por requisito, com arquivo/linha, evidência e prioridade. Não chamar sucesso de CI de substituto de verificação bancária externa.

## Status

Em 17/11/2026, **o contrato está documentado, mas ainda não existe um pacote MARCO ZERO auditado e integralmente certificado**. A plataforma preserva histórico e componentes de preparação que não devem ser excluídos antes de completar a convergência e a prova de funcionamento. A emissão final deste pacote depende de congelamento verificável do produto, não apenas da chegada de uma data.
