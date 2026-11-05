# LOOP 3.0 / AKITEMM — Decisões visuais do proprietário (05/11/2026)

## Regra de preservação
Não modificar visual, abas, atalhos, cores ou componentes já aprovados além do que o proprietário solicitar. Alterações adicionais só se necessárias à integridade de fluxos, com identificação clara. Identificar antecipadamente o que é PERMANENTE, TEMPORÁRIO DE TESTE ou PENDENTE.

## PERMANENTE
- Escritório do Cliente trata do LOOP, das posições, filas, tabuleiro, equipe, financeiro, pedidos, links e conta; preserva acesso à loja via botões/atalhos AKITEMM.
- A compra, escolha de itens, imagens, categorias, busca, filtros, carrinho e checkout pertencem à **LOJA AKITEMM**.
- O tabuleiro aprovado tem **centro e seis posições periféricas distribuídas circularmente em torno dele, dentro do anel dourado**, na paleta de cores anteriormente aprovada. A grade visual irregular atual no celular NÃO foi aprovada.

## TEMPORÁRIO DE TESTE
- A aba "Preparar pedido" foi **retirada do Escritório do Cliente** a pedido do proprietário. Testes de compra e preparação de pré-pedido agora se fazem pela própria Loja AKITEMM, usando a conta compartilhada. Não duplicar a loja dentro do Escritório.
- Indicadores/avisos de "ensaio", operações do motor experimental e produtos fictícios são homologação, não créditos comerciais.

## PENDENTE — corrigir só o que foi apontado
- Corrigir apenas o formato e as cores do **Tabuleiro**, sem alterar outras áreas.
- Na loja, a busca, categorias, cartões, imagens condicionadas ao cadastro e carrinho são preservados. **Os três quadradinhos cinza/verde/evento já foram convertidos em filtros reais**, com seleção visível, desmarcação ao repetir e botão Todos para limpar. Não pressupor fotos reais ou produtos definitivos cadastrados. A implementação de filtro é apenas visual: não cria posições nem pagamentos.
- Não remover, redesenhar ou acrescentar abas permanentes sem nova instrução.

Origem: inspeção do proprietário da prévia online, fotos do celular e confirmação verbal em 05/11/2026.

## Regra obrigatória: duas taxonomias de cores INDEPENDENTES — confirmação de 05/11/2026
- **CORES DA LOJA AKITEMM (somente produtos/ofertas):** CINZA = compra comum, não qualifica diretamente; VERDE = produto elegível que pode compor carrinho qualificado; DOURADO = produto com valor suficiente sozinho (ex.: PDF R$ 250, ou produto R$ 400/R$ 500); ROXO = evento especial de alto valor, com quantidade específica de posições configurada pelo administrador (ex.: carro R$ 10 mil / dez posições, respeitando regras e teto).
- **CORES DO LOOP (somente conta, filas, posições e tabuleiro):** VERMELHO = cadastro/posição não ativada; AZUL = posição com compra confirmada mas pendência de CPF/termos; VERDE = posição confirmada; AMARELO = Fila A prioritária; BRANCO = Fila B; DOURADO = posição da empresa. Manter as demais regras de fila/centro/estado aprovadas.
- Não inferir nem copiar cor do produto para cor do titular, posição ou fila. **Produto dourado não é posição dourada da empresa**; **produto roxo não muda a cor do cliente**. A posição derivada da compra qualificada segue seu próprio fluxo de confirmação.
- No código, interface, cadastro administrativo, filtros, eventos e testes, tratar os grupos como namespaces/campos separados; nunca reaproveitar um enum de uma área para estados da outra.
- Os filtros quatro cores da LOJA foram definidos como padrão. O estágio atual da vitrine ainda possui filtro EVENTO agrupado: separar DOURADO e ROXO no trabalho de implementação da loja, sem modificar as telas do LOOP nem misturar seus estados.
