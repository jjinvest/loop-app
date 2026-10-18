# Diário de decisões e execução — LOOP 0.3 / Motor V6

Atualizado em 18/10/2026. Projeto original: `jjinvest/loop-app`, desenvolvimento isolado em `fix/teste-escrita-catraca-20261014`, PR rascunho #1. **Não mesclar, publicar ou ativar recebimentos reais sem aprovação e validações adicionais.**

## Fonte de verdade na troca de conversas

Antes de alterar o projeto, ler o arquivo da Biblioteca `LOOP_03_COMANDO_CONTINUIDADE_18OUT2026.md` e comparar seu conteúdo com o código na branch. Referências visuais imutáveis no pacote `LOOP_03_PACOTE_NOVO_CHAT_18OUT2026.zip`: Tabuleiro, Escritório Virtual, Minhas Posições e Minha Equipe. A referência de imagem **não** significa que o código esteja concluído.

Quando houver dúvida, prevalece a **última decisão explícita do idealizador**, não textos antigos de testes, fotos fictícias ou suposições. Distinguir: **APROVADO** (requisito), **IMPLEMENTADO** (código), **TESTADO** (execução verificada), **PENDENTE** (trabalho restante), **NÃO DEFINIDO** (decisão ainda não tomada).

## Regras APROVADAS que não podem ser quebradas

- Um titular pode ter até seis posições. Cada compra qualificada cria posição inicialmente pendente. Confirmação individual: CPF fictício e termos na primeira, outras posições somente com confirmação própria. Nunca autoativar todas.
- Indicação ativa recebida só conta depois de escolha explícita de **UMA** posição confirmada do titular. O vínculo convidado → posição é definitivo, único, idempotente, auditável e persistido no SQLite; a pessoa indicada não pode ser reaplicada nem trocada.
- A promoção B→A ocorre **somente** para a posição vinculada; outras posições do mesmo titular não se movem. Minha Equipe, Minhas Posições, Tabuleiro e indicação no cabeçalho devem refletir dados persistidos únicos.
- Menu do cliente não contém aba lateral “Minhas Ativações”. A confirmação pertence a Minhas Posições. Manter ordem dos menus, ícones aprovados, visuais e fundo cósmico roxo. Tabuleiro A à esquerda, B à direita; centro + seis vagas, entrada na 6; regra 3A:1B e seis eventos válidos. Tempo decorrido não cria eventos ou pagamentos.
- AKITEMM: elegibilidade por produto/configuração administrativa, quantidade e valor mínimo no mesmo pedido. Borda verde discreta e texto “Pode gerar uma posição no LOOP” para elegíveis; cinza e “Este produto não gera posição no LOOP” para os demais. Venda não elegível não cria posição.
- Nenhum saldo ou bonificação hipotética deve ser tratado como dinheiro real, receita, garantia ou transferência. Dados fictícios de laboratório, LGPD e auditoria antes de produção.

## Alterações IMPLEMENTADAS nesta retomada — 18/10/2026

| Commit | Escopo | Observação |
| --- | --- | --- |
| `009ce2c5` | Loja AKITEMM: borda verde/cinza e descrições | Apenas UI específica de elegibilidade; backend e carrinho preservados |
| `f0e72653` | Motor, Simulador, Ponte, três pontinhos Minha Equipe, servidor laboratório, testes | Ativou modo por posição **por padrão no servidor local**, verificou adesão própria em tabela SQL, permitiu vincular posição ativa também no tabuleiro sem mover a catraca. Estados pendentes mostram ação desabilitada; vínculo confirmado mostra consulta |
| `1a449d30` e `e4a608d3` | Testes legados | Atualizados para não esperar promoção automática nem autoativação; estado dourado conferido pelo nome real |

**Atenção de compatibilidade:** o construtor direto da ponte ainda mantém `atribuicaoManualPorPosicao=false` como padrão para cenários legados; o servidor do laboratório usa o novo modo por padrão, podendo desligá-lo em teste específico com `LOOP_LAB_ATRIBUICAO_POR_POSICAO=0`. A transição dos simuladores antigos ainda precisa ser avaliada antes de declarar a migração geral concluída.

## TESTADO / COMO CONFERIR

Acompanhar GitHub Actions na **revisão HEAD**, não confiar em sucesso de commit anterior: `Testes do LOOP` (`npm test`) e `LOOP - Navegador celular e computador`. Após `e4a608d3`, a suíte de testes do LOOP foi aprovada; conferir o resultado correspondente do navegador no GitHub. Teste de atribuição individual cobre indicação ativa, pendente, bloqueio de troca, deduplicação, posição escolhida e posição já no tabuleiro.

## PENDENTE (não declarar pronto)

1. Conferência visual e funcional ponta a ponta de cada tela comparada às imagens aprovadas, em celular e desktop, sem redesenhos fora do escopo. UI mantém trecho legado **interno e invisível** de Minhas Ativações/rascunho; removê-lo com teste específico, sem afetar seleção ou ativação real.
2. Minhas Posições: garantir seis cartões visíveis (inclusive vazios), bolinha vermelha pequena em cada pendente, seleção contextual do cabeçalho (visão geral `6/6`, `#0000`) e histórico individual. Conferir três pontinhos à direita das linhas na apresentação final.
3. Testes adicionais de concorrência e requisições HTTP hostis do fluxo novo, persistência após reinício e auditoria detalhada; reavaliar importação de registros históricos legados sem reaplicar indicações.
4. Confirmar que nenhuma nova compra de conta com CPF já confirmado autoativa posição, inclusive produto/pacote específico. Completar conferência entre a classificação do admin, o carrinho e o motor.
5. Financeiro de produção, autenticação real, consentimento LGPD, PSP, entrega/fornecedor, sustentabilidade e enquadramento legal exigem etapas separadas, não habilitadas neste laboratório.

**Disciplina:** alterar exclusivamente áreas pedidas, checar diff, usar branch/PR existentes, executar testes na revisão atual, registrar evidências, e nunca confundir aprovação visual com sistema pronto.

## Continuidade — ajustes de posições e equipe (18/10/2026, sessão seguinte)

**Usuário reafirmou:** continuar os ajustes das posições sem modificar os visuais aprovados; ainda faltam outras abas (inclusive AKITEMM). Quando a integração destas áreas estiver pronta para revisão, informar claramente e não presumir aprovação.

- Commit `fd374a2d`: eliminou a seção interna legada `loop03-ativacoes` e o rascunho `loop03DistribuirIndicacao`; fez Minhas Posições renderizar sempre SEIS cartões, inclusive espaços vazios; colocou bolinha vermelha somente nos cartões de posições pendentes. Indicadores contextuais: sem seleção 6/6 + #0000, ao escolher uma posição índice correspondente/6 + #ID. Confirmação continua no cartão próprio; seleção do tabuleiro usa os mesmos IDs reais, sem movimentar a catraca.
- Commit `f9e44ac1`: Minha Equipe com três pontinhos alinhados à direita em cada linha; somente indicado ativo oferece vínculo, pendente tem ação bloqueada, vinculado exibe consulta permanente. Diferencia estado PENDENTE, AGUARDANDO CONFIRMAÇÃO e ATIVO com derivação da visão autenticada, sem alterar antigo campo `estado`; etiqueta Fila A amarela e Fila B branca. Adicionou testes de projeção e interface.
- **TESTADO:** GitHub Actions `Testes do LOOP` e `LOOP - Navegador celular e computador` aprovados no commit `fd374a2d`. Para `f9e44ac1`, conferir novamente os dois checks; não considerar teste aprovado até verificar o resultado.
- **PENDENTE:** comparar a aparência final às artes aprovadas, fluxo de vinculação ponta a ponta no navegador com convidado ativo, auditoria/concorrrência/restart do ledger, histórico por posição e demais controles de fluxo. Loja AKITEMM tem apenas a alteração pontual de borda/selo nesta rodada; checkout real, operações admin, fornecedor/entrega, Financeiro, banners, vitrine e implantação continuam dependências separadas e NÃO devem ser declarados concluídos.

## Referências de imagem recuperadas e correção do shell — 18/10/2026

O idealizador rejeitou explicitamente a captura técnica do laboratório como apresentação do LOOP 0.3. **Não enviar essa captura como imagem do escritório aprovado.** O padrão de referência está nos arquivos originais da Biblioteca/ZIP:

- `01_TABULEIRO_CLIENTE_APROVADO.png`
- `02_ESCRITORIO_VIRTUAL_APROVADO.png`
- `03_MINHAS_POSICOES_APROVADO.png`
- `04_MINHA_EQUIPE_APROVADO.png`

As quatro artes **são referências estáticas aprovadas**, não screenshots do app funcional. Precisam orientar cada aba e nenhum resultado técnico pode ser chamado de arte final. A ilustração mais antiga ainda inclui “Minhas Ativações” no menu, mas prevalece a decisão **posterior** de removê-la e integrar a confirmação individual à aba Minhas Posições. Os valores, usuários e números nessas imagens são exclusivamente ilustrativos e jamais devem ser transportados como dados reais de painel.

- `2c4be1cc`: corrige ordem CSS para a identidade visual do shell ter prioridade sobre `loop-futurista-v6.css`, eliminando cartões ovais verdes impostos pela cascata antiga; reposiciona logomarca superior em largura total, aprofunda roxo/noturno, ouro e moldura metálica do escritório. Nenhuma operação do motor foi modificada.
- `9f7760a4`: cartões de Minhas Posições reformulados em grade 3x2 (2 colunas em telas pequenas), identificação circular com estado C/A/B/pendente/vazio, número destacado e detalhes reais. Os seis espaços não representam seis posições compradas; nada é fabricado para preencher a arte.
- `f4b0128a`: corrige teste antigo `programador-prelancamento-v6-http.test.js` que utilizava janela fixa vencida `2026-10-18T09:00:00-03:00`; usa data futura relativa. GitHub Actions `Testes do LOOP` e `LOOP - Navegador celular e computador` **aprovados no commit `f4b0128a`**.

**PENDENTE:** homepage ainda usa publicações administradas e não tem o banner gráfico aprovado integralmente integrado; alinhar layout detalhado da aba Minha Equipe e Tabuleiro às quatro referências sem mexer na ordem do motor; revisar excesso de seções legadas visíveis abaixo dos cartões de Minhas Posições; AKITEMM, Financeiro e outros acabamentos permanecem em execução. **Não interpretar screenshot de laboratório que apenas passou nos testes como prova de fidelidade visual.**
