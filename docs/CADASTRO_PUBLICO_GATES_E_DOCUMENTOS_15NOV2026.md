# Cadastro real LOOP 3.0 — execução, consentimento e publicação

**Estado verificado em 15/11/2026:** o executável de release controlado foi publicado no serviço Railway `loop-identidade-real`, commit `dbf8c8a8b39fcc0c932c93822604e7b878d31800`. O deploy `0831493b-1c11-4d56-b5fb-e6b893287980` terminou **SUCCESS**. O processo está em modo **PREPARACAO_SEGURA**: conta nova, CPF e email não são aceitos ainda.

## ATUALIZAÇÃO VIGENTE — migração real concluída, cadastro público ainda fechado
**Data:** 15/11/2026, ~18h10 de Brasília (21h10 UTC).
**Rede migrada:** 2 identidades reais originadas na prévia, 1 vínculo de indicação, com `@Taisaassi` na posição ordinal **#0001** da rede do titular `VILELA`, verificado por consulta SQL no serviço de identidade real (log só registra booleano, sem divulgar telefone/e-mail). Senhas scrypt/salts, IDs originais, telefone cifrado, datas e vínculo preservados. Nenhum saldo, pedido, CPF fictício, giro, posição ou crédito de Sandbox foi importado. Outras contas avulsas da prévia não foram importadas automaticamente.
**Evidências Railway:** serviço de origem `akitemm-escritorio-preview`, deploy `3ac28a89-8ebf-4757-b88e-2063ff1ff0ac`, **SUCCESS**, log `LOOP_MIGRACAO_IDENTIDADES=COMPROVADA;CONTAS=2;VINCULOS=1;PRIMEIRA_INDICACAO_VILELA=true;BACKUP_REAL_RESTAURADO=SIM`. Serviço destino `loop-identidade-real` confirma `LOOP_MIGRACAO_REAL=CONFIRMADA;CONTAS=2;VINCULOS=1;PRIMEIRA_INDICACAO_VILELA=true;BACKUP_OFFSITE_RESTAURADO=SIM`.
**Reinício e recuperação:** após a migração, serviço real foi **redeployado** no deploy `7af2435d-c165-4555-aa21-1db41b5cc4e5` e terminou **SUCCESS**. Logs: `LOOP_NUCLEO_OPERACIONAL_REAL=COMPROVADO;COMPONENTES=17;CONTAS_MIGRADAS=2;SEM_PAGAMENTOS=SIM`; `LOOP_BACKUP_IDENTIDADE_PRIMEIRA_COPIA=COMPROVADA;PUT_GET_HASH_RESTORE_CHAVES=SIM;BYTES=409656;CONTAS=2`. Três serviços online, zero alertas e nenhuma alteração do domínio público atual.
**Próximo gate:** as contas migradas possuem marcador explícito de aceite de **documentos definitivos pendente**, sem fingir que termos LAB são consentimento legal definitivo. Cadastro público real permanece FECHADO. É preciso completar a identificação do controlador (razão social/CNPJ aplicável) e obter aprovação do texto final dos Termos/Privacidade. Depois, configurar `LOOP_REAL_TERMOS_*`, `LOOP_REAL_PRIVACIDADE_*`, ativar par de gates `LOOP_REAL_CADASTRO_GO=SIM` e `LOOP_REAL_APROVACAO_DOCUMENTOS=SIM` de forma atômica, verificar acesso real no domínio final, aceites e migração de login. Não ativar PSP nem saques.
**Histórico abaixo:** informações anteriores que dizem “0 contas reais”, “migração pendente” ou “primeira indicação não confirmada” descrevem **o estado anterior a esta atualização**; não devem ser usadas como status atual.

## Integração do núcleo definitivo — PUBLICADA E COMPROVADA NO RAILWAY
**Data:** 15/11/2026, aproximadamente 16h04 em Brasília (19h04 UTC).
**Serviço:** `loop-identidade-real`, volume permanente `/dados-reais/clientes.sqlite`, Railway ambiente técnico denominado `homologacao`, mas sem usar banco do ensaio.
**Publicação efetiva:** deploy `a1af3742-f017-40be-b3d7-b52b5dfb8a26` **SUCCESS**, commit `9d338d3674782e642e75eaf6d43c5a198c2da468`, código do núcleo fechado no repositório. Não marcar como mera preparação em GitHub: a migração das TABELAS efetivamente rodou no volume definitivo.
**Prova emitida pelo container ativo:** `LOOP_NUCLEO_OPERACIONAL_REAL=COMPROVADO;COMPONENTES=17;SEM_CLIENTES_OU_PAGAMENTOS=SIM`. A conferência read-only exige 17 tabelas, SQLite íntegro, catraca PAUSADA, 0 contas, 0 pedidos, 0 giros e 0 lançamentos; a rota de diagnóstico é privada e exige token interserviços.
**Nova recuperação externa:** `LOOP_BACKUP_IDENTIDADE_PRIMEIRA_COPIA=COMPROVADA;PUT_GET_HASH_RESTORE_CHAVES=SIM;BYTES=393272;CONTAS=0;SHA256=ffc6e76af946fb06c6ee61e92cca1de6742c2c17608bd9e82e0650573237526d`. Outras bases (mídias do catálogo e prévia) possuem backups separados e NÃO são cobertas por essa cópia.
**Componentes operacionalmente instalados no banco definitivo:** motor, livro financeiro, operação da catraca, auditoria HMAC, manutenção, catálogo e custos multidistribuidor, autenticação administrativa, pedidos e eventos comerciais, regras de cores, outbox de fornecedores, reservas de capacidade e reconsulta de reservas. Os adapters externos da outbox permanecem fechados, sem qualquer envio.
**Validação de código e navegação:** auditoria integral [GitHub Actions #43750899912](https://github.com/jjinvest/loop-app/actions/runs/43750899912) — dependências, regressão completa e navegador PC/celular **SUCCESS**; [prévia protegida #43750899835](https://github.com/jjinvest/loop-app/actions/runs/43750899835) **SUCCESS**. O deploy definitivo verificado permanece o citado acima; os ajustes posteriores afetam o roteiro do navegador, não significam nova implantação comercial.
**Atualização de segurança publicada:** deploy Railway `e9415a53-8e57-445e-8128-9393357b5da1` **SUCCESS**, commit `baa53a56d4b91dae79e17d4a284e3cc40019e96b`. Chaves independentes e configuradas no serviço para cotação, pedidos, outbox de fornecedor, auditoria e administração (nunca registrar valores). O log do container confirmou novamente o núcleo real completo com 17 tabelas, zero contas/pedidos/giros/pagamentos e restauração externa `PUT_GET_HASH_RESTORE_CHAVES=SIM;BYTES=393272;CONTAS=0;SHA256=c9081adbc95fb851e75829cd0499d8801636777663fb6ccffec8ae61c293c781`. Auditoria integral [GitHub Actions #43751440088](https://github.com/jjinvest/loop-app/actions/runs/43751440088): **todas as etapas SUCCESS** (regressão, segurança/bloqueios e navegação PC/celular).
**Não está liberado:** novo cadastro comercial, loja com checkout, PSP, PIX, saques, giros reais ou distribuição de recompensa. A simples existência do banco e dos serviços não prova operação comercial.
**Pendências para retirada da prévia:** termos/privacidade oficiais e aprovação; transição auditável das contas e indicações já criadas em `akitemmloop.com.br` (em especial `/escritorio/VILELA`) sem refazer cadastro; mudar o domínio somente após provar a interface e APIs definitivas. No momento, o domínio `akitemmloop.com.br` ainda usa `akitemm-escritorio-preview`. Não remover volume/cópia da prévia nem alterar DNS até a preservação dos dados ser comprovada.

## Primeira copia offsite da identidade real — COMPROVADA
**Data da prova:** 15/11/2026 às 14:13 (America/Sao_Paulo).
**Ambiente:** Railway `homologacao`, serviço de identidade **real** `loop-identidade-real`, banco persistente `/dados-reais/clientes.sqlite` (não é o SQLite da prévia).
**Código e publicação:** commit [`2637ce4`](https://github.com/jjinvest/loop-app/commit/2637ce4bf1f57aad8d31971d5b14b5cd93c11762), CI [SUCCESS #43739744553](https://github.com/jjinvest/loop-app/actions/runs/43739744553), deployment Railway `6e3f37e0-1bd7-46be-ad9f-afdb1d00aca6` **SUCCESS**.
**Log efetivo do container vivo:** `LOOP_BACKUP_IDENTIDADE_PRIMEIRA_COPIA=COMPROVADA;PUT_GET_HASH_RESTORE_CHAVES=SIM;BYTES=167992;CONTAS=0;SHA256=e9c4b1dcc5d6398e37666bad17c0faef687206d8818d8d9489fffeab63bc2ccc`.
**Etapas verificadas:** snapshot do SQLite real, arquivo cifrado, PUT ao bucket externo `identidade-real-backup`, GET, comparação integral SHA-256 e tamanho, restauração em arquivo isolado, integridade SQLite e leitura com chaves da identidade. A cópia continha **zero contas reais**, pois o cadastro permanece fechado, como esperado.
**Limites:** esta comprovação é do banco de identidade `clientes.sqlite`, não cobre automaticamente o arquivo comercial separado `catalogo-produtos.sqlite`, outros bancos, operações financeiras, restauração em outra região ou custódia independente do segredo-raiz. A operação em ambiente real não equivale a liberação comercial.
**Travas preservadas:** `LOOP_REAL_CADASTRO_GO=NAO`, documentos não aprovados, rotas de cadastro ainda bloqueadas; nenhuma conta, pedido, pagamento, bônus ou saque liberado.

## Regra permanente de entrega aprovada pelo proprietário
1. Corrigir usando telas, serviços e banco existentes; não recriar fluxos aprovados.
2. Testar unitário, integrado e navegador ponta a ponta.
3. Quando os gates do recurso forem satisfeitos, **publicar no Railway e verificar o deployment e o endpoint público**; não confundir verde em CI com deploy.
4. Se houver impedimento concreto de segurança, privacidade ou contratual, registrar qual requisito falta e quem fornece a informação, sem afirmar que está pronto.
5. Não habilitar compra, pagamento, saldo, saque, posição ou bônus com a liberação independente do cadastro.
6. Não importar identidades do ambiente de ensaio como se fossem contas verificadas da identidade comercial.

## O que já está operacional na infraestrutura
- Domínio Railway da identidade `https://loop-cadastro-real.up.railway.app`, gerenciado HTTPS, vinculado ao serviço.
- Volume persistente `/dados-reais` e custódia de chaves existentes da identidade; origem HTTPS configurada.
- Código de cadastro, convite, CPF/telefone cifrados, login, sessão, recuperação de senha e e-mails de verificação implementados.
- Roteador de execução `scripts/iniciar-cadastro-publico-release.js`: permanece em preparação enquanto `LOOP_REAL_CADASTRO_GO=NAO`; muda para serviço real somente com `GO=SIM` **e** `LOOP_REAL_APROVACAO_DOCUMENTOS=SIM`.
- Conjunto de testes de liberação aprovado: [GitHub Actions 43736675399](https://github.com/jjinvest/loop-app/actions/runs/43736675399).

## Cadastro inaugural por convite — preservar conta existente e vínculo

**Decisão do proprietário em 15/11/2026:** os participantes que já criaram conta válida no endereço `akitemmloop.com.br` por link de indicação **não devem ser obrigados a repetir o cadastro** quando o sistema comercial real for ativado. Caso inaugural: uma convidada cadastrou-se no link `/escritorio/VILELA`, com intenção de permanecer como **primeira indicada do titular VILELA**. Não publicar nome, CPF, e-mail, telefone ou senha dela nesta documentação.

**Evidência operacional** (Railway `akitemm-escritorio-preview`, horários de Brasília): GET `/escritorio/VILELA` 302 às 14:18:05; POST `/staging/contas/cadastrar` 201 às 14:19:48; POST `/staging/contas/entrar` 200 às 14:20:14. O gateway assina o cookie de indicação e injeta `x-akitemm-preview-indicador` apenas ao backend; `EquipeCandidataSQLite.registrarCadastro` registra o vínculo na mesma transação da criação de conta, ou a operação falha. **Ainda não se confirmou por consulta autenticada que esses pedidos pertencem à mesma sessão/titular**, nem que ela ocupa ordinal 1 da rede VILELA. Validar antes de afirmar isso.

**Regra da transição:** preservar o registro original e o vínculo histórico, incluindo indicador, cronologia e eventual ordinal #1, mediante mecanismo auditável de transição. Não apagar, sobrescrever ou recriar conta incompatível; não importar automaticamente dados fictícios de laboratório para produção, senhas em texto claro, sessões de ensaio nem saldos/posições/pagamentos simulados. No cadastro real, exigir apenas verificação de posse da conta, aceite dos documentos oficiais e eventual regularização dos dados estritamente necessários, sem refazer todo o formulário; a migração de dados pessoais depende de autorização/consentimento da titular e controles LGPD. Distinguir cadastro por convite de indicação **qualificada** por compra real. Aguardar validação do vínculo por consulta autenticada antes de atribuir ordinal de primeira indicada.

**Critério de conclusão:** a titular entra na conta recuperada/transferida no domínio definitivo sem segundo cadastro completo; a rede VILELA mostra o vínculo original exatamente uma vez e na ordem de origem correta; nenhum vínculo com outra conta ou crédito comercial é criado; os dados continuam segregados do laboratório até a transição autorizada. Este mecanismo **ainda não foi implementado nem executado**, e é bloqueio de migração dos primeiros cadastrados antes de declarar lançamento definitivo.

## Dependências concretas para ativar entrada de dados pessoais de verdade
- **Identidade do controlador:** nome completo ou razão social de quem responde pelos dados; não deduzir de nome de usuário ou marca.
- **Contatos oficiais informados pelo proprietário:** LOOP `jjinvest2024oficial@gmail.com`, AKITEMM `akitemmoficiall@gmail.com`. Não confundir com remetente técnico do Resend. Validar que ambos recebem mensagens antes de publicar documentos; os canais não substituem a identificação do controlador.
- **Termos de uso e aviso de privacidade definitivos:** textos baseados no cadastro real, incluindo identificação, finalidade, compartilhamentos, retenção, direitos e contato. A aprovação dos documentos deve vir do responsável; templates técnicos não constituem autorização jurídica.
- **Backup offsite de identidade — PRIMEIRA PROVA CONCLUÍDA:** comprovado no serviço real em 15/11/2026 por PUT + GET + SHA-256 + restauração isolada + leitura das chaves. O agendamento e a integridade das cópias futuras devem continuar monitorados; não liberar `GO` se a cópia mais recente falhar.
- **Teste do link de indicação na identidade real:** conta do indicador deve existir no SQLite real; um nick presente apenas no banco de laboratório não vale como indicador real. Validar primeiro cadastro e depois cadastro pelo link, sem dados de teste em conta real.

## Minuta — Termos básicos de uso (NÃO PUBLICAR COMO APROVADOS)
**Responsável:** [RAZÃO SOCIAL OU NOME DO CONTROLADOR — A CONFIRMAR] — **Atendimento LOOP:** jjinvest2024oficial@gmail.com.

O LOOP 3.0 permite criar e acessar uma conta pessoal e utilizar funções de perfil e convite. A criação exige nome, nick, CPF, telefone, e-mail, senha e concordância com as condições informadas. Cada pessoa é responsável pela confidencialidade de sua senha e pela exatidão de suas informações. Nicks são públicos para permitir convites; documentos e dados de contato não devem aparecer a terceiros.

A abertura de conta e o registro de convites **não garantem remuneração, posição, venda, bônus, saque ou crédito**. Compras e operações financeiras só serão oferecidas quando forem legalmente autorizadas, implementadas e divulgadas com regras específicas e transparentes. O usuário pode solicitar atendimento e exercer os direitos previstos na legislação. O serviço pode adotar controles técnicos proporcionais de segurança e suspender operações diante de fraude ou uso indevido.

**Este texto é apenas uma minuta.** Depende de revisão e aprovação explícita do responsável.

## Minuta — Política de privacidade do cadastro (NÃO PUBLICAR COMO APROVADA)
**Controlador:** [RAZÃO SOCIAL OU NOME DO CONTROLADOR — A CONFIRMAR] — **Contato oficial LOOP para dúvidas de privacidade:** jjinvest2024oficial@gmail.com.

São tratados nome, nick, CPF, telefone, e-mail, senha protegida por derivação criptográfica, histórico de aceite, dados de login, códigos temporários de verificação e registros de convite. A finalidade é criar conta, validar a posse do e-mail, permitir recuperação de acesso, registrar indicação, proteger o serviço e atender solicitações. O CPF e telefone ficam cifrados no banco da identidade; CPF é indexado por HMAC, e os dados não são destinados à vitrine pública.

Para a operação técnica podem ser utilizados provedores de hospedagem, armazenamento de backup e envio de e-mail (incluindo Railway, armazenamento S3 compatível e Resend), sujeitos aos serviços efetivamente contratados. Não se deve afirmar transferência internacional, prazo fixo de retenção ou compartilhamento não documentados. Informar na versão aprovada quais dados/arquivos são compartilhados, local de armazenamento, base legal apropriada, prazo/critério de retenção e procedimento de exclusão/portabilidade quando aplicável.

O titular poderá solicitar informações, correção e outros direitos previstos na Lei Geral de Proteção de Dados pelo canal de contato oficial. Senhas não são armazenadas em texto claro. A proteção técnica e a restrição de acesso não eliminam a necessidade de resposta a incidentes e governança de dados.

**Este texto é uma minuta a completar e aprovar**, não a política comercial vigente.

## Publicação final — critérios de aceite
- GO + documentos presentes e **aprovados**, com conteúdo e hash registrados.
- Primeira cópia offsite íntegra com restauração comprovada: **ATENDIDO em 15/11/2026**, conforme prova e log acima. Prosseguir somente com demais critérios de aceite.
- Novo deploy `SUCCESS` com comando `node scripts/iniciar-cadastro-publico-release.js` e `/readyz` retornando `CADASTRO_REAL_PRONTO_SEM_FINANCEIRO`.
- Criar conta do indicador no banco real, testar o cadastro da convidada, sessão, e-mail e entrada da indicação na rede real. Testar no PC e celular.
- Só então autorizar divulgação do endereço com assinatura de links pelo nick do indicador.

**Não confundir o link da loja/Escritório em staging com o link da identidade real.**
