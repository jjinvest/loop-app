# AKITEMM / LOOP 3.0 — Primeiro distribuidor identificado: WeDrop Start (07/11/2026)

## Confirmação do proprietário e fontes

O proprietário enviou duas capturas do guia **WE DROP START**, mostrando “Guia do novo membro: do zero à sua primeira venda” e “Agora você é um membro We Drop!”, com apresentação de Marcelo. Essas telas identificam o parceiro indicado para o **primeiro encaixe técnico da AKITEMM**. Elas **não** provam API autorizada, contrato ou direito de revender na loja independente; não supor que “parceria oficial Shopee” mostrada no guia constitua endosso independente nem permissão para API da Shopee. Usuário já informou que há mais de um distribuidor e muitos produtos, portanto o contrato `RegistroFornecedores` e catálogo `N produtos ↔ N distribuidores` permanecem genéricos; **não** limitar a loja à WeDrop.

Fontes institucionais consultadas em 07/11/2026:
- Página de vendas: https://wedrop.com.br/ — anuncia estoque, catálogo, postagem, loja própria e pagamento do custo do produto **após a venda**.
- FAQs da empresa: https://wedrop.com.br/institucional/ — informa integração com Shopify e possibilidade de lojas virtuais próprias; isto **não garante** suporte à plataforma customizada AKITEMM.
- Oferta WeDrop Start: https://site.marcelowedrop.com/wedrop-start-shopee-trends/ — fala sobretudo de operação via **Shopee**.
- Termos de lojista disponíveis publicamente, documento datado de maio de 2025 (confirmar se o Start usa termos iguais/atualizados): https://app.wedropbr.com.br/public/termos-e-condicoes-lojista-wedrop.pdf — seções 8 e 10: uso de **ERP Bling ou outro expressamente autorizado**, condições de ERP/cadastro fiscal, requisitos de pedido (SKU, quantidade, dados de destinatário, comprovante de pagamento/etiqueta conforme canal), responsabilidade por pós-venda; seção 11 prevê **pagamento do custo de aquisição da mercadoria ao parceiro após a venda** e eventual intermediação.
- Os termos de 2025 diferenciam regras para membro que opera via CPF e via CNPJ; NÃO presumir que o CNPJ do proprietário esteja regular ou que contrato de membro autorize a AKITEMM automaticamente.
- Não reutilizar logotipo, marca ou imagem da WeDrop na vitrine comercial sem autorização expressa; o documento restringe o uso de sinais da empresa.

## Decisões técnicas já fundamentadas

1. **Canal de integração ainda não comprovado para a conta WeDrop Start do usuário.** Possibilidades a verificar *na plataforma*: A) integração oficial por Bling/ERP aprovado, B) API/canal direto aprovado explicitamente pela WeDrop, C) procedimento comercial operado pelo painel. Não inventar rotas HTTP, tokens, endpoints, e não converter uma integração Shopee em API de fornecedor da AKITEMM.
2. O cliente compra **na AKITEMM** pelo checkout próprio; sua venda deve gerar **um pedido interno e pagamento**, depois as remessas independentes por distribuidor. Uma venda na Shopee, se vier a existir, é canal distinto; **não** duplicar pedido/receita por sincronização indevida.
3. Antes de enviar uma ordem à WeDrop, confirmar **dois fluxos financeiros distintos**: recebimento conciliado do cliente no PSP da AKITEMM e **custo de fornecimento/limite de crédito real** quitado/aprovado conforme regra contratual da WeDrop. Pix recebido de cliente não significa que o fornecedor já foi pago. O fluxo deve bloquear despacho sem as duas provas.
4. Antes da ativação, confirmar estoque/SKU/preço de custo da própria WeDrop, preço final AKITEMM, frete para CEP, tributação, margem, exigência de ERP, etiqueta, dados obrigatórios, rastreio, devoluções e tratamento de dados de cliente (LGPD). A WeDrop tem responsabilidades próprias, mas o cliente final continua sob suporte da AKITEMM no pedido da sua loja.
5. **Nenhum pagamento, pedido, inscrição, cadastro, produto ou conexão externa foi efetivado nesta etapa**. Este documento registra descoberta real do parceiro, não conclusão da integração.

## Próxima evidência necessária (uma só solicitação ao proprietário)

Ao abrir o **painel autenticado da WeDrop Start**, identificar **“Minhas Integrações”**, **“Bling/ERP”** ou a área de integração da loja (pode enviar captura ocultando e-mail, CPF, token e senha). Isso revelará se o plano permite **loja própria independente** e se a ponte é Bling ou API oficial. Se houver manual técnico, preferir URL do manual. Nunca pedir credenciais no chat nem expor dados pessoais reais em screenshots.

## Não alterar os projetos aprovados

Branch: `feature/unificar-escritorio-real-20261105`; PR #1 DRAFT. O projeto já tem catálogo multi-oferta, cotação com estoque/frete, pedidos de vários distribuidores, outbox idempotente e histórico de pedidos por titular. Acrescentar somente a integração autorizada real, sem recriar loja nem habilitar PSP real antes do go/no-go.

## Correção de expedição: duas confirmações independentes

A página pública da WeDrop afirma que o lojista paga o custo da mercadoria **depois da venda**, antes da remessa. Logo, o Pix do comprador confirmado pela AKITEMM **não é prova** de que a WeDrop recebeu o custo do produto. Foi corrigido o outbox `src/producao/pedidos-fornecedor-outbox.js` para exigir a função obrigatória `consultarLiberacaoCustoFornecedor({pedidoId,fornecedorId})`, **separada** de `consultarPagamentoConciliado`. O despacho só inicia quando essa consulta autoritativa retorna: pedido e distribuidor correspondentes, estado `CUSTO_QUITADO` ou `CREDITO_CONTRATUAL_AUTORIZADO`, referência validada e origem `CANAL_FORNECEDOR_AUTORIZADO`. Sem prova, retorna `CUSTO_FORNECEDOR_SEM_LIBERACAO` e mantém o pedido PENDENTE sem chamar a API de expedição. A própria WeDrop deve confirmar se o plano permite carteira/crédito e qual evidência retorna; **nenhum custo foi pago** e a função de produção **ainda não está ligada a canal externo**. Os testes de distribuidor usam dados artificiais. Isso preserva o fluxo 1 compra/1 cobrança para cliente, mas impede expedir sem a liquidação de custo do respectivo parceiro.


## Restrição efetiva do plano Shopee Start confirmada em captura do painel

**Nova evidência do proprietário, 07/11/2026:** no painel autenticado `dash.wedrop.com.br/my...` aparece textualmente: “O seu plano Shopee Start integra apenas lojas da Shopee. Para vender também no Mercado Livre, Amazon, TikTok Shop e outros canais, temos outro plano disponível.” O painel oferece upgrade “Conhecer o plano completo”, percebido pelo usuário como custo adicional de aproximadamente R$900. Esse valor **não foi verificado como cotação contratual** e não deve ser pressuposto nem comprado automaticamente. O usuário deseja manter as vendas/recebimentos e a coleta de dados do cliente **dentro da AKITEMM**, pagando posteriormente o custo ao distribuidor.

**Consequência concreta:** o WeDrop Shopee Start **não pode ser tratado como integração da própria AKITEMM**. Não desenvolver ponte que crie pedidos fictícios na Shopee, compre em nome de clientes ou use etiquetas de envios Shopee para vendas off-platform sem **autorização expressa das plataformas e base contratual/fiscal**. A logística Shopee é intermediada para transações em sua plataforma, com etiqueta gerada após o pagamento do pedido Shopee; repasse de pedido pago fora da Shopee não é recurso demonstrado. Fontes:
- https://help.shopee.com.br/portal/4/article/77113 (Termos de Serviço — entrega e logística);
- https://help.shopee.com.br/portal/4/article/124091 (Programa de Logística — etiqueta emitida para pedido pago na Shopee);
- https://wedrop.com.br/institucional/ (WeDrop afirma atender lojas próprias em **outros planos**, mas não comprova tal direito para Shopee Start);
- https://site.marcelowedrop.com/wedrop-start-shopee-trends/ (Shopee Start exige venda na Shopee e custo do produto pago após venda).

**Caminhos legítimos para triagem:**
1. Perguntar ao suporte se o membro Shopee Start pode contratar **expedição manual/autorizada de pedidos originados na AKITEMM**, preço por pedido, API/ERP/arquivo/portal, aprovação fiscal e rastreamento, sem exigir plano completo.
2. Verificar uma oferta formal de integração da **loja própria AKITEMM** em outro plano, apenas se houver prova de retorno econômico e necessidade real. Não pressionar o usuário a pagar upgrade.
3. Caso não autorizado, integrar outro distribuidor que suporte explicitamente venda externa via loja própria e despacho após pagamento do custo. Preservar catálogo multi-oferta e separação N produtos/N distribuidores já construídos.
4. Shopee pode ser **canal de vendas paralelo**, mas os pedidos originados e pagos na Shopee não devem gerar automaticamente compra/posição no LOOP como se tivessem sido pagos no checkout AKITEMM; tratar origens e reconciliação separadamente.

**Estado:** bloqueio de canal comercial **EXTERNO**, não falha da arquitetura multi-distribuidores AKITEMM. Não declarar a conexão WeDrop concluída, nem abrir checkout real sem a permissão e o fornecedor efetivamente homologado.
