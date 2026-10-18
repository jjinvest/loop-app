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

## Regra de equilibrio de acesso, NAO igualdade de resultados — 18/10/2026

**Correção expressa do idealizador:** o propósito da regra de alternância NÃO é gerar contemplações iguais, nivelar resultados nem impedir que participantes que indiquem mais pessoas recebam mais oportunidades. O objetivo é **evitar monopolização da prioridade de acesso à Fila A pelo mesmo titular**, preservando a via natural de entrada de quem não convida. Alguns participantes poderão avançar mais vezes do que outros; isso não representa erro de distribuição. Não escrever requisitos nem métricas que forcem resultados iguais.

**Invariantes de negócio aprovados e exemplos:**

- **Fila B = FIFO estrita de posições que ainda permanecem na B**, por ordem inicial de chegada. A não disputa prioridade por quantidade de indicações. Mostrar IDs reais remanescentes: depois de #1 sair, a primeira é #2; se #3 tiver sido promovida à A, a sequência visível da B fica #2, #4, #5...; após 10 posições saírem da B, próximas disponíveis a partir de #11, pulando as que não estejam mais nela. Na interface, não confundir índice visual com ID da posição.
- **Fila A = prioridade dinâmica**, por indicações confirmadas individualmente vinculadas, com desempate cronológico aprovado. Cada titular pode ter no máximo **uma posição simultânea na Fila A**. Indicações adicionais podem se acumular nas outras posições na B, mas não promovê-las enquanto a trava não for liberada.
- **Trava administrativa padrão = vaga 6**: assim que a posição prioritária anterior do titular entra na vaga 6 do Tabuleiro, uma nova posição dele que esteja habilitada por indicação pode disputar A. Administrador pode configurar futuramente vaga 5, 4, 3, 2 ou 1, com trilha auditável, afetando somente novas liberações; não reordenar posições já colocadas. Vaga 5 nas conversas antigas foi substituída pelo padrão 6.
- **Regra 3A:1B intacta**. Se uma pessoa tiver uma posição em primeiro lugar na A e outra na boca da B, as duas podem entrar normalmente no Tabuleiro quando chamadas por seus respectivos caminhos. Não criar trava sobre a saída FIFO natural da B, nem proibir múltiplas posições de um mesmo titular dentro do Tabuleiro.
- **Não confundir acesso com benefício financeiro**. A regra dá caminhos de participação, não garante que quem não indicar receberá necessariamente uma vez, nem que alguém receberá determinado valor ou num prazo específico. As simulações e testes de integridade do laboratório não demonstram sustentabilidade, legalidade ou resultados financeiros reais.

**Implementação base verificada:** commits `693d00d5` (trava por titular no motor), `e4eaf201` (configuração via área administrativa), `aa1865f5` (testes de seis posições e entrada FIFO independente da trava), `93f7fbff` (vaga 6 inicial, testes da B e migração auditada). No commit `93f7fbff`, GitHub Actions de testes e navegador passaram. O escritório do administrador em `/admin/loop03` é somente para laboratório local, não interface pública final.

**Objetivo de controle:** impedir concentração simultânea de PRIORIDADE na A, não limitar os ganhos com base em igualdade artificial. Antes da oferta ao público, assegurar termos transparentes, aviso prévio de mudanças administrativas, testes de abuso e análise jurídica, comercial e econômica.

## Revisao dos menus e separacao de etapas — 18/10/2026

**Última orientação do idealizador:** há **três abas encaminhadas aguardando ajustes finos e mínimos**, além de outras abas ainda não estabelecidas. Ele não enumerou explicitamente neste pedido quais são as três; não rotular arbitrariamente três como prontas. A revisão visual dos menus pelo idealizador ocorrerá depois da consolidação funcional. Critério de aceite: nenhum elemento de menu já descartado, especialmente o antigo “Vzinho” de Ativações, pode voltar por causa de uma imagem de referência antiga.

**Contrato objetivo do menu único do cliente:** Escritório Virtual (home) → Tabuleiro → Minhas Posições → Rede e Equipe (título Minha Equipe) → Financeiro → AKITEMM (link para a loja existente). Perfil é atalho do cabeçalho, não aba adicional na lateral. Ativações NÃO é item de menu, nem página própria: as ações individuais necessárias permanecem dentro de Minhas Posições. A navegação legada permanece oculta. Nunca inferir que a arte estática antiga com ícone de Ativações representa a navegação válida.

**Fila B:** cada linha exibe o número real #ID, sem nomes nem contagem de indicações. A própria posição é realçada por estilo e rótulo acessível. Ordem FIFO preservada, saltando IDs que já saíram para A ou Tabuleiro. A Fila A classifica por convite individual confirmado; regra 3A:1B e trava de uma posição na A por titular continuam, padrão vaga 6.

**Verificações desta rodada:** contrato estático dos destinos e proibição de Ativações em `test/interface-loop-03.test.js`; navegação real pelas cinco telas internas em celular e computador, com uma tela visível por vez e sem menu legado, em `scripts/testar-loja-mobile-browser.js`. Testes do navegador e testes gerais precisam ser aprovados neste commit. Os testes não substituem aprovação estética nem jurídica.

**Próxima revisão:** conferir com o idealizador os ícones, composições e nomes do menu; comparar Escritório Virtual, Tabuleiro, Minhas Posições e Minha Equipe às quatro referências; retomar as abas pendentes (Financeiro, AKITEMM, painel administrativo e integrações) sem presumir que já estão acabadas.
