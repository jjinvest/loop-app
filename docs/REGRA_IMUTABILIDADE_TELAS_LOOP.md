# ORDEM PERMANENTE — TELAS DO LOOP 3.0 / AKITEMM

Recebida do proprietário em 14/11/2026.

**Nenhum desenvolvedor ou IA está autorizado a mudar o desenho, disposição, cor, rótulo, tamanho, posição, estrutura ou comportamento visual das telas do LOOP por iniciativa própria.** Melhorias percebidas devem ser sugeridas separadamente, sem execução. Em caso de instrução ambígua, perguntar antes de editar; não presumir autorização.

Se houver pedido expresso, editar **somente o trecho** autorizado. Preservar todos os outros componentes, versões PC/celular, comportamentos, menus, links e regras. Não criar portal paralelo, reescrever a interface inteira, trocar temas ou "aproveitar" para corrigir coisas fora do escopo. Revisar o diff contra a solicitação. Qualquer mudança fora do escopo deve ser revertida antes do commit.

## Consequência automática

O arquivo `docs/CONTRATO_VISUAL_LOOP_APROVADO.json` congela, no presente momento, **24 arquivos HTML/CSS** de cliente, loja e administração por hash de objeto Git. O teste `test/contrato-visual-escritorio-aprovado.test.js` reprova com `ALTERACAO_VISUAL_NAO_AUTORIZADA` se houver alteração de HTML/CSS sem autorização registrada e atualização explícita do hash daquela única peça. O workflow GitHub Actions `.github/workflows/congelamento-telas-aprovadas.yml` roda automaticamente na branch e em pull requests. Uma falha nesse CI é bloqueio de homologação e publicação; não declarar trabalho pronto.

**Limite declarado:** hashes e testes podem ser alterados por alguém com permissão de escrita, portanto esse mecanismo não substitui revisão humana, regras de branch/PR e conferência do proprietário. Código JS também pode alterar a tela dinamicamente; alterações funcionais devem ser conferidas visualmente no navegador e contra esta regra, mesmo quando o hash não mudar.

## Único escopo visual autorizado nesta missão

No resumo inicial do Escritório Virtual: manter **três quadradinhos superiores** (Minhas Posições, Giros nas Últimas 24h, Posição Selecionada); excluir **apenas três quadradinhos redundantes abaixo do banner** (Meus Pedidos, Minhas Posições, Minha Equipe), mantendo os quatro botões de ação (Meus pedidos, Minhas posições, Loja AKITEMM, Atualizar). O restante da tela e os 10 espaços da aba Minhas Posições devem continuar iguais. A ligação dos três indicadores com os valores reais do motor e a navegação é correção funcional expressamente solicitada. O contador de 24h não pode fingir ser total vitalício.

Para novas alterações, só renovar os hashes de arquivos especificamente autorizados no pedido; registrar o escopo e o commit de aprovação no GitHub. Não alterar este inventário para forçar testes a passar após uma edição não solicitada.
