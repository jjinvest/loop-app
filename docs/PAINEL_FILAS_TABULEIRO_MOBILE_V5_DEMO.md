# LOOP V5 — Filas e tabuleiro para celular (laboratório)

## Objetivo

Permitir que um comprador veja A, B e o tabuleiro no próprio Escritório Virtual, com destaque das suas posições e sem revelar dados de outras pessoas. Esta atualização **não altera as regras do motor nem a prioridade 3A:1B**.

## Visual das filas

Na seção `Mapa das posições`, há três modos de consulta:

1. **Resumo** (padrão): exibe as doze primeiras posições de cada fila e todas as posições do comprador, mesmo quando sua posição estiver muito atrás. Exibe lacunas quando há posições intermediárias não mostradas.
2. **Minhas posições**: mostra somente as posições que pertencem ao comprador, mas conserva os índices verdadeiros dentro de cada fila.
3. **Fila completa**: mostra todas as posições na ordem real de A e B, com rolagem quando a lista é grande.

A numeração das posições (1ª, 2ª, 50ª...) reflete sua colocação **na respectiva fila**; não é uma previsão de tempo, data de contemplação ou retorno financeiro.

As cores permanecem:

- **Azul:** aguardando ativação, visível em azul para todos. Apenas o titular vê um contorno adicional e a identificação “Minha”.
- **Vermelho:** posição ativada vista pelo titular.
- **Cinza:** posição ativada vista pelos outros participantes.
- **Dourado:** posição pertencente ao LOOP, inclusive quando a posição azul entrou no tabuleiro sem ativação. Essa posição **não** recebe marcador “Minha”, mesmo para seu comprador original.

A projeção do servidor fornece apenas `posicaoId`, `cor` e `minha`; nome, conta, CPF, e-mail, telefone e outras informações de terceiros não são transmitidos no mapa.

## Tabuleiro

O desenho conserva sempre **um centro e cinco vagas**, inclusive em telas estreitas, com o centro na posição central. As vagas aparecem ao redor do centro em um grid de três colunas, com ocupação independente. As cores são as mesmas das filas. Não há um sétimo assento e nenhuma operação de giro é feita pelo navegador.

## Navegação entre telas

O Escritório Virtual tem atalhos internos para a loja, os pedidos, as filas e a ativação (quando houver posição azul). Na loja, há atalhos de volta ao escritório, diretamente aos pedidos ou ao mapa. Ao retornar, a tela espera o carregamento assíncrono da sessão antes de rolar ao destino da URL.

## Validações

- `test/mapa-filas-tabuleiro-mobile.test.js`: simula **100 pessoas**, ocupa centro + 5 vagas, promove uma posição à fila A por indicação e verifica vermelho/cinza/azul/dourado, titularidade, ausência de dados de terceiros, snapshot imutável e os elementos e breakpoints da interface.
- Os testes anteriores verificam a criação automática de uma posição azul por compra qualificada, os estados do histórico e os cinco giros.

## Limitações

Tudo continua em laboratório, rodando apenas em `127.0.0.1`. O teste automatizado confirma a estrutura responsiva do HTML/CSS e os dados, mas não substitui uma inspeção visual em aparelhos físicos ou emulação real de navegador. Não há pagamento, contemplação nem entrega reais.
