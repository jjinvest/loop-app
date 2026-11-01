# LOOP 3.0 / AKITEMM — Índice numerado das conversas e continuidade

**Criado em:** 01/11/2026. **Fonte técnica:** branch `fix/teste-escrita-catraca-20261014` de `jjinvest/loop-app`; PR #1 DRAFT.  
**Objetivo:** recuperar decisões por um número curto e facilitar a troca de chat sem refazer o projeto.

## Padrão de identificação a partir de agora

- **LOOP-C001, LOOP-C002...** = conversas comuns do ChatGPT. Atribuir **um número novo por conversa**, nunca reaproveitar.
- **LOOP-W001, LOOP-W002...** = sessões do **Work**, em sequência independente.
- **LOOP-H001, LOOP-H002...** = **marcos históricos** reconstruídos de registros anteriores. Não são IDs originais de chats nem significam necessariamente uma conversa para cada marco.
- Usar o número no título do chat quando o usuário puder renomeá-lo: `LOOP-C001 — Índice e Marco Zero`. A alteração do título no aplicativo não pode ser feita por este arquivo.
- Em cada novo chat: primeiro ler [índice técnico vigente](./LEIA_PRIMEIRO_LOOP_30_INDICE_VIGENTE.md), [documento-mestre](./COMANDO_MESTRE_LOOP_03_CONTINUIDADE.md) e **HEAD real do GitHub**. Este índice é **navegação**, não substitui o código nem as evidências.
- Registrar decisões novas com **aprovado / implementado / testado / pendente**, links de documento e commit quando conhecidos. Não colocar credenciais, CPF, informações particulares nem transcrição integral das conversas.
- **Concorrência:** ChatGPT e Work podem consultar o mesmo repositório, mas antes de gravar cada um deve reler o HEAD; evitar editar os mesmos arquivos em paralelo. Sem merge, deploy, ativação comercial ou pagamentos reais sem autorização.
- Quem abrir um novo chat pode dizer: **“01, continue pelo LOOP-C002 e pelo índice numerado no GitHub.”** O novo ID deve ser a próxima posição realmente usada.

## Conversas contemporâneas

| Número | Data | Referência | Assunto/decisões | Estado |
| --- | --- | --- | --- | --- |
| **LOOP-C001** | **01/11/2026** | Esta conversa; número atribuído agora | Segurança da homologação Asaas; CI 702/702 e Chromium; organização das conversas; preparação para Marco Zero | **Em andamento**; PR #1 DRAFT, sem merge/deploy |
| **LOOP-W001** | **01/11/2026** | Identificador **reservado**, a confirmar no Work | Sessão do Work mencionada pelo proprietário. Ler HEAD antes de trabalhar; não pressupor arquivos ou decisões ainda não verificadas | **Não verificado nesta sessão** |

> **Importante:** não é possível mudar automaticamente o nome das conversas na interface nem localizar um chat antigo pelo ID criado aqui. Para encontrar conversas anteriores, o histórico do ChatGPT deve ser pesquisado por título, data e assunto. A numeração do projeto é a referência estável deste índice.

## Marcos históricos (reconstruídos, sem inventar IDs de conversa)

| Marco | Data aproximada | Localizador de assunto | Regras ou trabalho preservados |
| --- | --- | --- | --- |
| LOOP-H001 | 16/09/2026 | Início do aplicativo de filas | Projeto inicial, conexões e primeiras telas |
| LOOP-H002 | 12–17/10/2026 | Funcionamento comercial / AKITEMM | Produto elegível, indicação, fila B→A, regras de valor e cartões |
| LOOP-H003 | 18–19/10/2026 | Continuidade / quatro telas | Tabuleiro, Escritório, Minhas Posições, Minha Equipe; 3A:1B e visual aprovado |
| LOOP-H004 | 20–22/10/2026 | Financeiro e integrações | Painéis e responsividade, SQLite, testes de concorrência, backup, taxa de saque **0%**, mínimo R$ 25 |
| LOOP-H005 | 23–24/10/2026 | Auditoria ponta a ponta e administração | Verificações internas, Escritório Administrativo e relatórios, pendências externas |
| LOOP-H006 | 26–28/10/2026 | Asaas Sandbox e titularidade | Pix fictício de R$ 250, conciliação, posições, erros de titularidade/reprocessamento |
| LOOP-H007 | 31/10/2026 | Pedido e reinicialização SQLite | Fluxo comprador, reprocessamento idempotente e testes no navegador |
| LOOP-H008 | 01/11/2026 | Marco Zero / 10.000 usuários | Ensaios de escala, fluxo de compra, callbacks, seis gates externos do pré-lançamento |
| LOOP-H009 | 01/11/2026 | Segurança da homologação | Condição manual de execução; baixa em dinheiro não comprova Pix; CI 702 PASS |

Estes são **marcos de assunto** encontrados em registros de continuidade, não uma numeração retroativa exata de todas as conversas. Detalhes específicos devem sempre ser confirmados no GitHub ou no chat original.

## Onde ficam os registros técnicos confiáveis

1. [Índice técnico vigente](./LEIA_PRIMEIRO_LOOP_30_INDICE_VIGENTE.md).
2. [Documento-mestre (seções mais recentes 136–137 neste momento)](./COMANDO_MESTRE_LOOP_03_CONTINUIDADE.md).
3. [Relatório da auditoria ponta a ponta](./AUDITORIA_PONTA_A_PONTA_LOOP_24OUT2026.md).
4. [Continuidade de callbacks Asaas](./CONTINUIDADE_CALLBACK_ASAAS_01NOV2026.md).
5. [CI 713 testes e navegador](https://github.com/jjinvest/loop-app/actions/runs/41334971242).

## Como registrar uma nova conversa sem repetir auditorias

Adicionar uma linha na tabela contemporânea, incrementar o número da mesma série e referenciar o assunto e a seção do documento-mestre. O Work deve usar `W`, o chat comum deve usar `C`. Se a numeração real do Work ainda não estiver confirmada, manter `RESERVADO`, sem marcar como concluído. Nunca transformar estimativa de progresso em “pronto para inaugurar”. Os seis gates externos do Marco Zero ainda dependem de provas e decisões independentes.

## Plano de migracao de aparelho, conta ou assistente

1. **Celular novo ou computador:** acessar o ChatGPT com **a mesma conta**; chats sincronizados permanecem na nuvem do ChatGPT. O GitHub fica separado.
2. **Outra conta do ChatGPT:** nao presumir transferencia de historico, memorias, arquivos nem plugins. A pessoa deve autenticar a nova conta e reconectar o GitHub com suas permissoes; se desejar referencia historica, pode exportar conversas na conta anterior e enviar o `conversations.json` para uma nova conversa, **sem recriar historico ou memoria**.
3. **Outra IA:** abrir o repositorio no GitHub, conferir a branch `fix/teste-escrita-catraca-20261014`, o HEAD, este indice, o documento-mestre, as capturas e os testes. A outra IA precisara de credenciais/permissoes proprias para o GitHub; nao transferir API keys nem segredos em chat.
4. **Perda de acesso ao ChatGPT:** o repositorio GitHub **nao e removido** por isso. Recuperar a propria conta GitHub; conferir que o repositorio e a branch ainda existem e que PR #1 segue rascunho.
5. **Rastreabilidade:** textos no indice e resumos tecnicos sao referencia, nao copia integral de todas as mensagens. Quando a evidencia estiver num chat antigo, buscar pelo assunto/data no historico da conta original ou usar a exportacao autorizada.

Ajuda oficial: https://help.openai.com/en/articles/8142208-chatgpt-ios-and-android-app-faq e https://help.openai.com/pt-br/articles/9106926-transfer-exported-conversations-between-chatgpt-accounts.

