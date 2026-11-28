# Cofres, contadores e filtros — 28/11/2026

Base conferida: `41537283ab14e8055b1b6f37b7fe77cfe66c7299`, branch oficial `feature/unificar-escritorio-real-20261105`. Pedido do proprietário: refletir eventos nos cofres (investimento/reserva/douradas), preencher os contadores de Posições e corrigir seleção simultânea Ofertas/Cinza. Preservar visual e lote; START exclusivo do proprietário.

## Causas e correções

- `carregarAbaOperador` consultava o lote mas enviava ao renderizador apenas filas e ciclo atual; omitindo eventos acumulados, ciclos do dia/histórico e primeiros IDs. Agora repassa `financeiro.contadores` do livro, os primeiros registros das filas e o mesmo snapshot do ciclo. Zero passa a ser zero, não ausência de informação.
- Ao permanecer em Posições, a consulta rápida do lote só funcionava na aba Distribuição; os cofres não acompanhavam novos lançamentos nessa tela. A mesma consulta autenticada agora atualiza Posições e aplica os saldos existentes a cada dois segundos enquanto a aba está visível. Leitura sem mudança de snapshot não reconstrói o resumo, preservando os detalhes/scroll; respostas de outro módulo são descartadas.
- Ofertas e cor eram dois booleanos independentes. Agora Ofertas limpa cor; selecionar cor desliga Ofertas. Todos continua limpando os filtros. Categoria e busca mantêm suas funcionalidades. Nenhuma cor de produto foi alterada.

## Destinos financeiros preservados e verificados

O motor vigente permanece sem alteração: para centro participante, eventos 1/3/5 → `LOOP_CENTRO`; 2/6 → investimento (`LOOP_ESQUERDA`); 4 → reserva (`LOOP_DIREITA`). Centro operacional dourado usa `DOURADA_INTEGRAL_V2`: seus seis eventos vão ao cofre dourado. Bônus de indicações confirmadas consomem somente a reserva coberta; por isso reserva líquida pode ser zero mesmo depois de uma entrada, caso ela já tenha quitado bônus pendentes.

O teste novo percorre 100 eventos em SQLite em memória, verifica destino de cada evento pelo centro que efetivamente o recebeu, exige ao menos seis eventos dourados, compara cofres aos SUMs dos lançamentos e comprova conservação de R$25.000. Não transfere valores nem executa START publicado.

## Sentido dos contadores

No lote, Eventos no ciclo é o contador do motor (0–6); Eventos acumulados é a janela de 24h do livro; Centros concluídos hoje usa o dia civil de Brasília; Ciclos concluídos no total é o histórico persistido. Não calcular ciclos reais a partir de luzes previstas. Os testes também verificam um exemplo com 4/6, 100 eventos em 24h, 15 centros no dia e 20 no histórico.

A programação de 15 centros é uma meta, não quinze centros já concluídos. A inicialização consultada em 28/11 às 02h03 Brasília ainda registrava zero eventos/giros, caixa R$250.000 e catraca/porteira fechadas. Esse registro é daquela inicialização; não prova o estado de comandos posteriores. Nenhum evento será fabricado para preencher cards ou transferir recurso porque uma luz de previsão se acendeu.

## Validação e limites

Teste de navegador real com Playwright em celular e computador verifica Ofertas/Cinza nos dois sentidos, aria-pressed de Todos e regressão de cadastro/fotos/ordenação. Testes do resumo e da distribuição usam dados persistidos em ambientes isolados.

Não se alteram contas comerciais, produtos publicados, filas, meta salva, saldos originais, regras ou proteções externas. O livro do lote continua separado das carteiras comerciais; nenhum saldo de P001 etc. é atribuído artificialmente a conta real. A conferência publicada do proprietário requer atualizar a página para carregar a revisão nova.

## Resultado final de regressão

1.788 testes aprovados, zero falhas/cancelamentos/ignorados. Manifesto: 930 arquivos íntegros. Navegadores PC/celular: zero erros JavaScript e seleção de filtros aprovada.

SHA256 paineis-regressao.log: `8e81e05af234249430aef487ef768ec4405edd59e773004c2cdb6882e401ba88`.

SHA256 paineis-mobile.log: `a81e309c44879731b0cfc46fd9a7c6f3fe74524cbf4cb7a4a955837d496f20e2`.

SHA256 paineis-pc.log: `a81e309c44879731b0cfc46fd9a7c6f3fe74524cbf4cb7a4a955837d496f20e2`.
