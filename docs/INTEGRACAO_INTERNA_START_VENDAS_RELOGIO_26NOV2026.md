# Conexão interna de vendas, filas e Distribuição — 26/11/2026

Decisão expressa do proprietário nesta conversa: somente ele comanda START/Pausar. Sem meta de centros, o fluxo livre depende das vendas qualificadas e confirmadas, na janela padrão 09:00–18:00 de Brasília. Com meta, a programação distribui seis eventos por centro. Vendas e ordenação continuam durante a pausa. Nenhum START foi executado no lote publicado de mil posições.

## Caminhos implementados

- `PedidosComerciaisSQLite.confirmarPagamento` consulta o adaptador PSP, persiste pedido/evento/outbox e chama a integração de filas existente. O sincronizador passa a criar somente posições; não registra luzes durante sincronização ou preparação do centro.
- `SincronizadorComercialLoopEnsaioSQLite.processarDistribuicao` consome um evento comercial ainda não utilizado por vez, passando pela autorização transacional de `OperacaoCatracaAdminSQLite.registrarEventoDaDistribuicao`. O sexto evento permite um giro, auditado no mesmo SQLite. Repetição, pagamento cancelado, falta de centro, horário, data, limite, pausa e programação têm verificações próprias.
- `politica-execucao-distribuicao-loop.js` é a mesma decisão de cadência utilizada pelo controle integrado e pelo lote existente do operador. Sem meta não há intervalo comercial de dez segundos. Com meta, a abertura/fechamento e a quantidade determinam a cadência. START, retomada e reprogramação não reproduzem marcos vencidos.
- A bancada persistente mantém a autorização explícita de START, conserva seu livro e os registros de mil posições, e usa a programação salva na Central. Consultas/visores não executam START. O polling do servidor é transporte, não um intervalo comercial.
- O visor usa a próxima luz calculada pelo servidor e os eventos persistidos do lote. O modo livre mostra fluxo de vendas, não um cronômetro fictício de dez segundos. Os horários salvos permanecem visíveis nos dois perfis; o cálculo anterior à abertura e após meia-noite foi corrigido.

## Limite comprovável

O lote de mil permanece no SQLite isolado `testes-modulos.sqlite`; não é convertido em compras comerciais ou saldo bancário. O caminho de pedidos comerciais é exercitado com o mesmo checkout, classificação, identidade, motor e APIs, em testes com respostas controladas do provedor. A composição publicada ainda mantém o PSP/fornecedor sem homologação e os métodos de promoção financeira de ensaio vedados em produção. Esta alteração não implementa nem certifica uma ponte produtiva de confirmação bancária, reserva/consumo financeiro real ou pagamento externo. Não afirmar que basta cadastrar uma chave bancária nem declarar toda a plataforma 100% pronta.

## Provas exigidas

Compra cinza não qualifica; pagamento confirmado cria posição mesmo com catraca pausada; sincronizar não cria eventos; usuário autoriza execução; livre respeita janela e vendas disponíveis; programado respeita meta/tempo; pausa/retomada e reinicialização não duplicam; os eventos do livro financiam o giro; caixa do lote se conserva. Testes relevantes: `promocao-pedido-motor-ensaio-sqlite`, `bancada-modulos-independentes-operador-real`, `checkup-tabuleiro-agenda-compartilhada`, `motor-loop-integrado-identidade` e os contratos visuais.
