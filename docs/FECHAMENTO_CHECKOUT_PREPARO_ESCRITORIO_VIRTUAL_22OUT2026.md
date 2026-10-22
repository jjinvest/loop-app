# LOOP 3.0 — Encerramento técnico do checkout e preparação da aba Escritório Virtual (22/10/2026)

**Status:** laboratório e documentação; PR #1 em rascunho. **A tela do Escritório Virtual não foi modificada.** Este arquivo é apenas um mapa para a próxima conversa/fase, sem proposta visual que substitua aprovações anteriores.

## 1. Regra imutável do checkout até nova ordem

1. A pergunta opcional **“Você gostaria de participar do LOOP?” permanece implementada mas OCULTA** no checkout da AKITEMM, com `habilitarConviteLoopCheckout=false` por padrão.
2. Enquanto oculta, **não existe decisão SIM/NÃO tomada pelo cliente**; nenhuma escolha negativa é inferida da ausência da pergunta.
3. Produto explicitamente qualificado + quantidade mínima aprovada + subtotal elegível do pedido a partir da referência atual **R$250** + **pagamento confirmado** ⇒ **posição criada automaticamente na fila LOOP**, seguindo regras de limite e pacotes.
4. Essa posição inicia **PENDENTE** de ativação, cabendo ao titular **confirmar a posição individualmente** dentro do LOOP. CPF/termos conforme regras já aprovadas; não ativar posição automaticamente. Compra menor, inelegível ou pedidos separados não se somam indevidamente.
5. A vitrine não muda preço/custo/quantidade ou elegibilidade por conta da pergunta oculta. **PDF é único produto comercial planejado a R$250**; qualquer SKU de testes em R$150 ou R$500 é apenas fixture fictício, não oferta real.
6. Se o dono autorizar **futuramente** mostrar a pergunta, verificar novamente os termos da oferta e o que a resposta faria no checkout. **Não ligar a pergunta por iniciativa do desenvolvedor.** Direitos legais de consumidores não são afastados.

### Travas testadas

- `test/loop-v6-convite-checkout-oculto-por-padrao.test.js`: compra qualificada fictícia R$250 cria posição depois da confirmação, status de ativação PENDENTE, escolha oculta não bloqueia.
- `test/loop-v6-regressao-checkout-original-convite-oculto.test.js` (teste adicional desta etapa): pedidos **separados** de referência hipotética R$150 não se acumulam; produto **não qualificado** de referência hipotética R$500 não cria posição; carrinho misto com R$500 excluídos + R$150 elegíveis não cria posição; carrinho misto com R$500 excluídos + **PDF elegível R$250** cria somente **uma** posição após confirmação fictícia e permanece pendente; repetição de evento não cria outra posição. Verificar logs de CI para resultado homologado.
- Teste original de opt-in de consumidor **permanece disponível em ambiente de testes explicitamente habilitado**; essa feature não altera o fluxo padrão com convite escondido.

## 2. Mapa verificado para preparar a próxima fase: aba ESCRITÓRIO VIRTUAL

**Atenção à identidade:** “Escritório Virtual” **é a aba existente do PARTICIPANTE**, não o novo **Escritório do Administrador**. Não criar nem alterar este último sem a frase explícita autorizadora. A próxima conversa pode ser sobre qualquer detalhe visual/função do Escritório Virtual; **aguardar a indicação do dono sobre qual parte mexer** antes de modificar telas.

### Componentes identificados diretamente no código

| Papel | Arquivo/controle já existente |
| --- | --- |
| Estrutura de navegação | `src/laboratorio/loop-03-shell.js`, `#loop03Sidebar`, botão `data-loop03-aba="home"` com rótulo **Escritório Virtual** |
| Conteúdo da aba | `#loop03-home` com título **Novidades e eventos**, hero **ESCRITÓRIO VIRTUAL**, arte decorativa, botão **ACOMPANHAR MINHAS POSIÇÕES →** apontando para a aba `posicoes` |
| Comunicações | `#loop03Publicacoes`: mural de **Comunicados da Administração**; fonte em `src/domain/publicacoes-home-loop-v6-demo-sqlite.js` |
| Layout e responsividade | `src/laboratorio/loop-03-shell.css` e `src/laboratorio/participante-demo.css` |
| Montagem das visões | `src/laboratorio/participante-demo.js` e `src/laboratorio/loop-03-shell.js` |
| Fonte individual de dados | `src/domain/escritorio-individual-demo.js`: compras próprias, posição, cor/fila, equipe, convites, bônus fictício; **sem expor CPF de terceiros** |
| Link comercial | Sidebar com vitrine AKITEMM `#loop03VitrineArea`, foto e nome opcionais, CTA **CONHECER A LOJA →** levando a `/loja` |
| Identidade privada/pública | Perfil guarda dados privados; UI pública usa **nick**, foto opcional e **coroa só quando posição selecionada está no tabuleiro/centro**, não nome civil. Rodapé não é removido |
| Preservação de abas | Tabuleiro, Minhas Posições, Rede e Equipe, Financeiro, AKITEMM; menu aposentado **Minhas Ativações** não pode ressurgir |

### Regras ao iniciar a revisão da aba

- **Não modificar nada antes do pedido visual/funcional específico**: hero já aprovado, dimensões, fotos, nick, coroa, vitrine, títulos e rotas existentes permanecem.
- Verificar mudanças **somente na seção solicitada**; navegar em celular/computador com regressões para que outras abas não mudem.
- Trabalhar na branch `fix/teste-escrita-catraca-20261014` e manter **PR #1 DRAFT**, sem merge/deploy.
- Simulações são *somente laboratório* e não comprovam PSP, Pix ou benefício financeiro real.

**CI HOMOLOGADO:** [Testes do LOOP, 39715135056](https://github.com/jjinvest/loop-app/actions/runs/39715135056) **SUCCESS, 503/503, zero falhas**; [Navegador celular/tablet/computador, 39715135015](https://github.com/jjinvest/loop-app/actions/runs/39715135015) **SUCCESS**, ambos no código `b1035e675c8f6cea1cd01733262af8d7bfe94ee9`.
