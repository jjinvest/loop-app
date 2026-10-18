# LOOP 0.3 / V6 — Missão 4: ramificações funcionais e panorama das quatro abas

Data de referência: **18 de outubro de 2026**. Branch de trabalho: `fix/teste-escrita-catraca-20261014`, PR **#1 em rascunho**. Não houve merge, deploy nem operação financeira real.

## Regra de preservação visual

As artes originais aprovadas continuam sendo o norte visual, **sem redesenho**:
- `01_TABULEIRO_CLIENTE_APROVADO.png`
- `02_ESCRITORIO_VIRTUAL_APROVADO.png`
- `03_MINHAS_POSICOES_APROVADO.png`
- `04_MINHA_EQUIPE_APROVADO.png`

**Distinção obrigatória:** arte aprovada não é screenshot da versão funcional. O laboratório já integra dados reais do seu SQLite **fictício**, porém a comparação pixel a pixel entre a implementação e as quatro artes ainda é uma etapa de acabamento visual. As artes antigas contêm palavras/abas que foram revogadas posteriormente: a versão vigente do menu já removeu **Minhas Ativações**, portanto não restaurar essa aba por copiar a arte original.

## Aba 1 — Escritório Virtual

- Preservar espaço de comunicados, banners e acessos AKITEMM. Publicação administrável pelo operador, cliente em modo leitura, na mesma identidade visual dourado/roxo/noturno.
- Nenhuma indicação vinculada automaticamente pelo banner nem saldo/ganho prometido.

## Aba 2 — Tabuleiro

- Fila A à esquerda, Fila B à direita, centro e seis vagas, entrada pela vaga 6; progresso só por seis eventos genuinamente válidos.
- **Regra global intocável:** 3 entradas A / 1 entrada B quando ambas abastecidas. Se A esvaziar, B segue normalmente. A posição do influenciador pode ser priorizada **dentro da A**, nunca suprimindo a vez da B.
- Trava de **uma posição do mesmo titular na A**; liberação seguinte quando a anterior atingir a vaga configurada pelo administrador (padrão 6, exemplo aprovado vaga 5). B FIFO.
- Bola A: **amarela com letra branca** na padronização verbal/visual aprovada agora; bola B não mudar. **Não redesenhar o Tabuleiro aprovado por causa deste ajuste de texto**.
- Correção funcional de plural do contador: `1 indicação` / `2 indicações`, sem alterar o desenho.

## Aba 3 — Minhas Posições

- Exibir sempre seis cartões de posições; **apenas números, quantidades e estados**, nunca lista de nomes de convidados dentro da grade.
- **UM contador único acima da grade:** `Indicações disponíveis para distribuir`, exibindo apenas convidados **validados, ATIVOS e ainda sem vínculo**. Exemplo: 100 disponíveis, cinco atribuições individuais confirmadas -> **95**. Nunca criar contador fictício ou somar clique sem pessoa válida.
- **Cada posição ativa** recebeu botão funcional `+ Adicionar indicado` **abaixo do cartão**, sem alterar o clique do cartão para selecionar posição/confirmar CPF fictício. Desabilitar em posição pendente ou sem convidados disponíveis.
- O botão solicita confirmação explícita e o servidor seleciona **o próximo convidado ativo e não vinculado, por ordem de confirmação**, associando-o permanentemente à posição escolhida por meio do mesmo método individual de Minha Equipe.
- O SQLite é a fonte única: desconta 1 do contador disponível, soma 1 na posição escolhida, reflete Minha Equipe e as filas. Nenhuma indicação pode ser consumida duas vezes.
- A pessoa ainda pode escolher **qual convidado específico** pela aba Minha Equipe. **Não há seleção em lote nem edição reversível**, para não multiplicar efeito ou criar ambiguidade sem regra aprovada.
- Primeiro aceite de posição pede CPF fictício e termos; demais posições demandam confirmação individual, sem reaproveitar ativação automática.

## Aba 4 — Minha Equipe

- Lista de pessoas convidadas pelo link, seus estados ATIVO / PENDENTE / AGUARDANDO CONFIRMAÇÃO e respectivos locais A/B/Tabuleiro, observada privacidade.
- Menu **três pontinhos** da pessoa ativa permite escolher **uma das próprias posições confirmadas** e confirmar vínculo permanente.
- Uma vez atribuído, menu passa a mostrar vínculo **somente leitura**, nunca transferência para outra posição.
- A ação `+1` iniciada em Minhas Posições aparece imediatamente aqui após atualizar a mesma projeção SQLite.

## Escritório administrativo profissional (SEPARADO das quatro abas do cliente)

- Manter a identidade dourado/cromado + roxo cósmico em uma CENTRAL DE COMANDO exclusiva do proprietário.
- Dados técnicos e controles de direção continuam **somente no admin**: A/B agregadas, giros, catraca, configuração auditada da vaga 1..6, histórico com revisão/justificativa, atalhos para Financeiro, AKITEMM, contas e publicações.
- Novo quadro conectado por **API autenticada** ao SQLite compartilhado: `Indicações confirmadas`, `Disponíveis para distribuir`, `Vinculadas definitivamente`, `Aguardando ativação/conferência`.
- Menu administrativo com acesso ao quadro de distribuição; números são agregados e não expõem nomes de convidados ao público. Sem botões fictícios de pagamento ou mudança da razão.
- O admin é **base funcional já conectada**; o acabamento final visual de alta fidelidade e demais módulos operacionais continuam evolutivos.

## Implementação e testes verificados

Arquivos principais:
- `src/laboratorio/loop-03-shell.js`, `loop-03-shell.css`, `participante-demo.js`
- `src/domain/ponte-compras-convites-demo-sqlite.js`, `escritorio-individual-demo.js`
- `src/routes/participante-laboratorio-demo.js`
- `src/routes/admin-circuit-break-v6-demo.js`
- `src/laboratorio/admin-loop03.html`, `admin-loop03.js`, `admin-loop03.css`
- `src/laboratorio/servidor-catalogo.js`
- `test/distribuicao-indicacoes-posicoes-admin.test.js` e `scripts/testar-loja-mobile-browser.js`

Testes gerais e navegador celular/computador **aprovados** na revisão `65225b8703b376c45652d9c6ae2699659996aa67`:
- `Testes do LOOP`, execução `39164927745`: `completed/success`;
- `LOOP - Navegador celular e computador`, execução `39164927758`: `completed/success`.
- O teste de navegador criou dois convidados, atribuiu um pela equipe e outro pelo `+1`; verificou que o saldo foi **1 -> 0**, contagem da posição **2 indicações**, Minha Equipe atualizada, Fila A refletida e quadro administrativo autenticado.
- Capturas originais da execução estão preservadas no artefato CI `capturas-responsivas-loop` (id `12150198042`).

## Estado real

**Concluído e testado:** ramificações de +1, contador único, projeções de equipe/posição, quadro admin conectado, correção do plural e regressões Android/desktop simuladas em navegador.

**Ainda NÃO declarado completo:** acabamento de aparência pixel a pixel contra quatro artes (incluindo banner gráfico, ícones, alinhamento e refinamentos visuais), modelagem de todas as funções administrativas comerciais e prontidão de produção. Não reintroduzir tela lateral de ativações, não alterar regras 3A:1B, não apagar histórico, não fazer merge/deploy/saques reais sem autorização.
