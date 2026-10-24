# LOOP 3.0 — Participação OPCIONAL no carrinho AKITEMM (22/10/2026)

**Decisão expressa do proprietário.** Implementação restrita ao laboratório; PR #1 DRAFT. Não há pagamento, checkout ou PSP reais.

**VERIFICADO:** [Testes do LOOP #39707617445](https://github.com/jjinvest/loop-app/actions/runs/39707617445) **SUCCESS, 501/501, zero falhas**, e [Navegador celular, tablet e computador #39707617457](https://github.com/jjinvest/loop-app/actions/runs/39707617457) **SUCCESS**, ambos sobre o commit de código `533cf7567181ef6a0514a193febcd8939c9455b5`.

## Regra da compra

No fechamento do carrinho, **se o subtotal de itens QUALIFICADOS para LOOP atingir pelo menos R$250** (ou a referência vigente configurada), perguntar sem nenhuma alternativa pré-marcada:

**“Você gostaria de participar do LOOP?”**

- **Sim, quero participar do LOOP.** O comprador escolheu participar. O servidor grava a escolha no pedido; apenas depois do pagamento confirmado (fictício no laboratório) o fluxo poderá criar a posição, que ainda requer confirmação individual do titular. Obedecer aos limites e regras de pacote qualificado.
- **Não, quero comprar somente na AKITEMM.** Venda normal: sem parcela do pedido destinada ao LOOP, sem criação de posição e sem bônus por essa compra. O preço e os itens permanecem iguais.
- **Nenhuma resposta em carrinho qualificado:** impedir a finalização até escolher SIM ou NÃO.
- **Subtotal de itens qualificados abaixo de R$250:** compra comum, sem exibir pergunta. Produto não qualificado nem sempre é barato: mesmo custando R$500 ou mais, não contribui ao limiar LOOP. Num carrinho misto, somar **somente os itens qualificados**, conforme quantidades mínimas congeladas.
- **Itens ou quantidades alterados:** apagar resposta anterior para o cliente confirmar novamente.
- A resposta SIM **não é renúncia ao direito legal de reembolso, arrependimento ou garantia**. A decisão de política comercial “O LOOP não dá estorno VOLUNTÁRIO da parcela de referência” está registrada nas seções 87–88, mas restituições obrigatórias por lei continuam preservadas.

## Implementação

- `src/laboratorio/loja-cliente-demo.html`, `.css` e `.js`: pergunta acessível no carrinho, dois rádios SIM/NÃO sem pré-seleção, aviso de que não renuncia a direitos, cálculo de subtotal qualificado, bloqueio se ausência de resposta e resete se alterar o carrinho. Nenhum redesenho de telas já aprovadas.
- `src/routes/participante-laboratorio-demo.js`: rota de criação do pedido do cliente exige `{itens,participarLoop:boolean}`. Não aceita valor, titular ou preço arbitrários; cliente não consegue marcar pedido pago.
- `src/domain/carrinho-loja-loop-demo-sqlite.js`: tabela `admin_carrinho_escolha_loop_demo` com ID do pedido, escolha SIM/NÃO, subtotal qualificado **original**, referência e timestamp. Triggers impedem edição/apagamento. Se NÃO, zera a contribuição elegível para o motor LOOP, sem mexer no valor bruto, itens ou pagamento da compra. SIM com subtotal qualificado menor que referência é rejeitado pelo servidor.
- Compatibilidade com históricos antigos do laboratório: ordens criadas diretamente pelo administrador de teste sem escolha permanecem como `participarLoop=null`. **Isso NÃO autoriza checkout real sem opt-in**; a rota do comprador já exige SIM/NÃO, e qualquer outro futuro canal público também deverá exigir.
- `test/loop-v6-optin-explicito-checkout-sessao.test.js`: compra R$500 qualificada com NÃO não gera posição após confirmação; R$500 com SIM gera só após confirmação fictícia; R$500 excluído não participa; R$750 misto com só R$250 qualificados pode participar; ausência da resposta e payload adulterado são recusados; registro SQLite imutável. Demais testes legados e browser foram ajustados para a escolha expressa.

## Exemplo

| Pedido | Escolha | Resultado |
|---|---|---|
| PDF qualificado R$250 | SIM | posição após confirmar pagamento |
| Produto qualificado R$500 | NÃO | compra AKITEMM, R$0 no LOOP |
| Produto qualificado R$500 | SIM | uma posição conforme regras |
| Produto excluído R$500 | Não apresenta escolha | compra AKITEMM, sem posição |
| Produto excluído R$500 + PDF qualificado R$250 | SIM | R$250 qualificados, uma posição |
| Carrinho qualificado sem SIM/NÃO | nenhuma | finalização bloqueada |

**Não publicar termos de vedação absoluta de estorno.** CDC arts. 18, 49 e 51 preservados, inclusive restituição de parcela internamente referenciada ao LOOP se devida em lei. A escolha SIM não isenta a empresa dessas obrigações.

**Preservar:** preços/margens ficam com o proprietário; taxa de saque 0%; PR rascunho sem merge/deploy, sem Escritório do Administrador novo. Vender de verdade depende de revisão jurídica e PSP contratado, com conciliação bancária.
