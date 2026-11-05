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
- **Implementação concluída no código:** a LOJA já possui quatro filtros independentes CINZA/VERDE/DOURADO/ROXO, com cards e marcações distintas; o administrador classifica por produto. O tabuleiro do CLIENTE usa seis vagas posicionadas radialmente ao redor do centro, apenas na aba Tabuleiro. Os estados do LOOP permanecem independentes.

## Compatibilidade e limites da revisão
- Cor DOURADO exige produto com valor unitário de pelo menos R$ 250; compra composta verde é outro caso. ROXO marca evento a configurar e homologar, não libera dez posições por simples cor.
- Classificações antigas EVENTO são interpretadas como ROXO para leitura; a coluna SQLite legada e os históricos imutáveis são preservados com tabela de classificação V2 transacional. Nenhum banco foi zerado.
- Cores de produtos jamais são repassadas como cor de posição, fila ou dono. Motor, pagamentos e direitos permanecem com gate independente de homologação.
- Só a loja sofreu alteração nos filtros/cartões; só a aba Tabuleiro sofreu alteração na geometria. Sem outras remodelações.
