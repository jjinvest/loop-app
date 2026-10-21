> **Saldo da reserva ≠ bruto:** o ensaio original de 5.000 reportava R$ 104.000 de entrada BRUTA no cofre direito, sem subtrair comissões nem novas douradas financiadas. Uma auditoria extra com 20 douradas **novas** (R$ 5.000 da reserva) e cinco azuis convertidas confirmou simulações de reserva livre entre R$ 68.050 e R$ 86.800 após bônus hipotéticos de 10% dos indicados considerados verdes. [Relatório de conciliação da reserva](./RELATORIO_RESERVA_5000_20_DOURADAS_21OUT2026.md). As posições azuis convertidas já provêm de compra e não geram segundo aporte de R$ 250. **Produção exige conciliação dos compromissos realmente persistidos em SQLite.**

# LOOP 3.0 — LEIA PRIMEIRO: índice vigente e decisões operacionais
Atualizado em 21/10/2026. **Esta é a porta de entrada para retomar o projeto rapidamente.** Complementa, não substitui nem apaga, o histórico integral.

## Fonte, segurança e precedência
- Repositório: `jjinvest/loop-app`. Desenvolvimento: branch `fix/teste-escrita-catraca-20261014`, PR #1 em **DRAFT**. **Proibido merge, deploy, divulgação de produção ou alteração da branch principal sem autorização explícita do proprietário.**
- Fonte extensa/histórica: `docs/COMANDO_MESTRE_LOOP_03_CONTINUIDADE.md`. Backup INTEGRAL pré-organização: `docs/historico/COMANDO_MESTRE_LOOP_03_INTEGRO_PRE_LIMPEZA_21OUT2026.md`. Histórico não é ordem de implementar decisões revogadas.
- Para regras recentes, a decisão **mais nova, expressamente aprovada pelo usuário** prevalece sobre o texto antigo. Antes de codar, conferir código e testes atuais no HEAD da branch; snapshots de commits antigos não são estado atual.
- O nome **visual é LOOP 3.0**. `LOOP 0.3` identifica a fase/arquitetura legada em alguns caminhos e documentos, **não** a marca nas telas.
- Este índice resume decisões e separa **[VIGENTE]**, **[ADIADO]**, **[REVOGADO]**, **[LABORATÓRIO]**. Nunca alterar fluxos financeiros nem visuais aprovados apenas por causa de um resumo.

## [VIGENTE] Motor, posições, indicações
1. Uma compra/pedido **qualificado e confirmado** cria **exatamente uma posição LOOP**; compra de produto não elegível é venda AKITEMM sem posição. A elegibilidade depende da configuração comercial e do valor/quantidade necessários. **Não inventar posições quando uma compra não alcança a regra.** Até seis posições por titular, ativações individuais; primeira confirmação de CPF/termos não ativa automaticamente outras posições.
2. Filas A (amarela) e B (branca), prioridade **3A:1B quando ambas têm vagas**. A indicação validada e ativa liga-se a **uma só posição selecionada**, persistente, idempotente; só essa posição recebe o benefício de prioridade. No máximo uma posição do mesmo titular em A por vez, com liberação escalonada conforme vaga administrativamente configurada; B preserva ordem de entrada.
3. Centro + **6 vagas** periféricas; posição nova cruza a **vaga 6**. Posição pendente **azul** que chega à vaga 6 sem a confirmação exigida torna-se **dourada operacional do LOOP**, sem duplicar/remover posição ou deslocar cadeiras ilegalmente. Douradas não indicam pessoas. As transições são eventos históricos, não 20 douradas simultâneas no tabuleiro.
4. Motor de ciclos atual tem **6 eventos de venda por ciclo** e destinos de referência alternados entre participante/empresa (3+3), com roteamento próprio quando centro pertence ao LOOP. Catraca, pausa, conferência financeira e rastreabilidade precisam continuar separados. Valores projetados não equivalem a crédito liquidado, saldo bancário ou saque realizado.
5. Nicks identificam usuários na interface (incluindo foto opcional e coroa/A/B); nomes civis permanecem para o cadastro/validação, respeitando as diferenças específicas de UI da loja. Nunca ressuscitar a promoção automática de todas as posições.

## [VIGENTE] Telas preservadas
- Participante: Tabuleiro, Minhas Posições, Minha Rede/Equipe, Financeiro, Perfil e navegação atual; **preservar visual aprovado** e alterar somente o que for solicitado. O rodapé do Tabuleiro exibe foto opcional + **nick**, estado A/B/coroa conforme regras.
- **Meu Perfil**: é o **único lugar para *alterar* senha** de conta existente: senha atual, nova senha e confirmação, com confirmação no servidor; revogar sessões e exigir novo login. Cadastro e login mantêm campos normais de senha, que não são mudança de senha.
- **Escritório Virtual do participante**: revisão geral de visual/conteúdo **[ADIADA]** até instruções do usuário. Já há componentes legados a analisar; não fazer mudanças autônomas.
- **AKITEMM**: loja com identidade visual preto/ouro, separada do motor mas integrada por critérios de elegibilidade. Catálogo, pedidos, produtos, avaliações moderadas pós-entrega, fotos e vídeo, carrinho, lateral e links existentes têm regras específicas nas seções 61–63 do histórico. Não recolocar botões ou textos expressamente removidos.
- Cloudflare R2 para mídia privada **[PENDENTE]**: o usuário iniciou ativação, mas exigência de pagamento ficou pendente. **Bucket/credenciais não confirmados**; não afirmar integração remota ativada, não pedir segredos no chat, não colocá-los em GitHub.

## [LABORATÓRIO] Testes de 1.000 compradores — já executados e validados
- Fonte reproduzível: `scripts/simular-1000-compradores-loop-v6.js`; testes: `test/loop-v6-mil-compradores.test.js`. **Quatro variações A/B × indicações altas/moderadas, sem alteração do motor real da aplicação.**
- Um fundador inicial no centro **sem compra**; 1.000 compradores distintos, uma unidade por pessoa: 500 PDFs de **R$ 250** (criam 500 posições) e 500 produtos de **R$ 190** (não qualificam sozinhos, criam 0 posições). Para testar nova política de elegibilidade, criar outro cenário separado, não falsificar este.
- Todas as variações: **83 ciclos concluídos** (1 fundador, 62 clientes, 20 douradas), 2 eventos PDF pendentes no próximo ciclo, 7 ocupantes atuais do tabuleiro e **411 posições aguardando** nas filas A+B. As 20 douradas surgiram **ao longo** das entradas da vaga 6 por conversão azul→dourada, não 20 de uma vez; chegaram a concluir os ciclos.
- A com indicações altas: A=122, B=289, indicações=238. A/moderadas: A=5, B=406, indicações=89. B/altas: A=122, B=289, indicações=237. B/moderadas: A=5, B=406, indicações=88. Valores dependem do cenário e não projetam procura real.
- Faturamento **bruto hipotético**: 500×R$250 = **R$125.000** + 500×R$190 = **R$95.000** = **R$220.000**. Sem custos de produto, taxas, impostos, frete, reembolsos e logística: **NÃO é lucro**.
- Dos 498 eventos PDF dos 83 ciclos completos, alocação referencial: centro participante **R$47.250**, douradas **R$15.000**, esquerdo **R$41.500**, direito **R$20.750** (total R$124.500), mais 2 eventos/ **R$500** como referência pendente. Não representar como pagamento real; bônus de indicação também são hipotéticos.
- **Prioridade imediata do projeto: continuar testes e provar robustez**, preservar logs/relatórios, corrigir falhas validadas antes de qualquer entrada de clientes reais.

## [LABORATÓRIO] Teste geral com 5.000 compradores e jornada do cliente (21/10/2026)
- **Relatório dedicado:** [RELATORIO_TESTE_GERAL_5000_21OUT2026.md](./RELATORIO_TESTE_GERAL_5000_21OUT2026.md). Contém premissas, comparação A/B, giros, 20 douradas surgidas pela vaga 6, conservação de 2.501 posições e distribuição financeira hipotética.
- Teste do motor **PASSOU em 4 cenários**: 2.500 PDFs R$250, 2.500 físicos R$190, 416 ciclos concluídos, 2.078 posições nas filas, 7 no tabuleiro e 4/6 eventos do ciclo seguinte. Receita bruta simulada R$1.100.000, sem lucro apurado.
- Teste de navegador Playwright/Chromium é **separado**, percorre abas, carrinho, perfil, seletor, indicações, financeiro e saques bloqueados quando não há saldo; amostras representativas, **não** 5.000 navegadores simultâneos. Fluxos de navegador APROVADOS no CI **39660816834**: físico R$190 exige endereço e mantém **0/6**, PDF R$250 cria **1/6**, navegação em todas as abas (duas rodadas por conta), senha no Meu Perfil e saque bloqueado sem saldo liquidado. A bateria geral também passou no CI **39660816955**. Ver relatório para detalhes e ressalvas de ambiente.
- Em testes de navegador, nicks fictícios precisam obedecer à regra de **apenas letras, 1–9 caracteres**; não afrouxar validação para fazer teste passar. Não alterar visual aprovado por falhas transitórias sem investigação.

## [ADIADO] Escritório do Administrador — conceito aprovado, criação NÃO autorizada ainda
- O proprietário **delegou** proposta arquitetural para sua central de comando; quer **várias abas bem organizadas**, funções certas nos lugares certos, sem atalhos/botões repetidos, design profissional e intuitivo. Consultar boas referências de ERP, logística, OMS, operações e e-commerce quando chegar a etapa.
- **PRIORIDADE ABSOLUTA SERÁ DADOS REAIS**, não simulações: volumes de compradores, pagamentos efetivamente confirmados, posições por estado, filas A/B, indicações e vínculos, giro/catraca, centros/contemplações e seu status **previsto/autorizado/pago**, douradas, cofres/reservas e fluxo financeiro, pendências e alertas. **Resumo de operação no primeiro olhar**, com detalhe auditável nas abas, sem usuário ter de caçar informações.
- Correção e verdade dos dados acima de apresentação: única fonte persistida, reconciliação e controles, idempotência, trilha de auditoria; não fabricar números nem apresentar projeções como fatos. Simulações podem ter módulo próprio **secundário** e inequivocamente rotulado.
- A **primeira versão da proposta de administração** será criada pelo assistente **apenas quando o usuário mandar “cria o Escritório do Administrador”**. Depois o proprietário revisa o que acrescentar/remover. Até lá, conservar admin existente; **não criar UI nova por iniciativa própria**.

## [REVOGADO] Nunca ressuscitar do histórico
- Mudança automática de **todas** as posições pela indicação de um convidado.
- Ativação automática de todas as posições após cadastro/primeiro CPF/termos.
- Menu lateral separado **“Minhas Ativações”**.
- Múltiplas posições do mesmo titular simultaneamente concorrendo em A.
- Posições LOOP indiscriminadas por produtos comuns abaixo do critério necessário.
- Cursos de terceiros por simples links de afiliado; modelo atual só curso próprio ou revenda negociada.
- Ciclo com **5 eventos**; versão vigente usa **6**.
- Marca visual **“LOOP 0.3”**; usar **“LOOP 3.0”**.
- Títulos/regras antigas do histórico que contradigam decisões expressamente posteriores (ex.: numeração repetida 53, 60, 61 e 68 no documento longo). **Usar este índice para identificar o estado vigente; manter o texto antigo apenas como prova da evolução.**

## Regras para manutenção deste índice
- Escrever primeiro a decisão objetiva atual e referenciar seu detalhe no documento longo. Marcar alterações futuras como **VIGENTE/ADIADO/REVOGADO/TESTE** e datar.
- **Não apagar nem reescrever histórico sem backup íntegro**. Códigos, tabelas, dados, branches, arquivos de UI e capturas aprovadas não são lixo.
- Se uma hipótese não estiver confirmada no código ou em fala explícita do proprietário, marcar **“a confirmar”**, não fixá-la como decisão. Fazer verificação específica quando for implementar.
