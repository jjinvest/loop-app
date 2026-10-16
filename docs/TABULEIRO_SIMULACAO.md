> **ATUALIZAÇÃO DO LOOP V6 (16/10/2026):** este arquivo preserva decisões anteriores para consulta histórica. A regra vigente no laboratório é **centro + 6 vagas, entrada pela vaga 6, 6 vendas por ciclo (cliente, investimento, cliente, reserva, cliente, investimento), até 6 posições abertas por CPF/conta fictícia, pacote especial de 6, saque mínimo de R$ 25 e taxa de 3% sobre cada saque de bônus ou participação**. Consulte `docs/LOOP_V6_SEIS_VAGAS_SAQUE_25_TAXA_3.md`. Não há saques nem pagamentos reais.

# Tabuleiro e ciclo LOOP - especificacao do prototipo

## Regras preservadas

- O tabuleiro e fixo, com **um centro** e **cinco vagas numeradas de 1 a 5**.
- Cada posicao e identificada independentemente da pessoa: uma mesma pessoa pode adquirir mais de uma posicao.
- Novas posicoes entram nas filas antes de ocuparem uma vaga do tabuleiro.
- A selecao da fila para uma vaga livre usa a regra 3A/1B e, dentro da A, a quantidade de indicacoes validas, com desempate pelo instante de conclusao da mesma quantidade.
- O tabuleiro **nao muda os ocupantes ja posicionados** quando alguem e promovido para a fila A; a prioridade so atua quando for selecionar uma nova posicao para uma vaga.
- A fila segue recebendo novas posicoes mesmo com a catraca pausada.

## Cinco vendas e o centro

Enquanto a pessoa ocupa o centro, a contagem do ciclo registra cinco eventos de venda (nesta etapa, somente simulados), na ordem:

| Numero | Destino previsto (sem valores reais) |
| --- | --- |
| 1 | Participante do centro |
| 2 | Empresa |
| 3 | Participante do centro |
| 4 | Empresa |
| 5 | Participante do centro |

Cada evento tem identificador proprio para evitar repeticao. O ultimo (quinto) evento torna o ciclo **elegivel para giro**, sem efetuar transferencias financeiras.

## Catraca e giro

- A catraca **PAUSADA** bloqueia o giro mesmo com cinco eventos completos.
- A catraca **ABERTA** permite o giro somente quando os cinco eventos do ciclo foram registrados.
- Giro fixo: **Centro sai; 1 -> Centro; 2 -> 1; 3 -> 2; 4 -> 3; 5 -> 4; nova posicao da fila -> 5**.
- Nao ha sexto evento no mesmo ciclo; o proximo ciclo comeca do zero apos um giro.
- Se nenhuma posicao estiver aguardando nas filas no momento do giro, o simulador deixa a vaga 5 vazia. Nao inventa participante nem pula a ordem.
- Cada posicao carregada do motor de filas conserva seu identificador durante o deslocamento.

## O que esta implementado

- `src/domain/motor-filas.js`: filas e prioridades.
- `src/domain/tabuleiro-loop.js`: estado e giro do tabuleiro.
- `src/domain/simulador-loop.js`: orquestrador isolado dos dois motores e catraca.
- `test/motor-filas.test.js`, `test/tabuleiro-loop.test.js`, `test/simulador-loop.test.js`: cenarios automatizados.

## LIMITES DE SEGURANCA E PROXIMAS ETAPAS

**Nenhum destes motores autentica compras reais, confirma pagamentos, libera saldos ou realiza contemplacoes.**

- O `SimuladorLoop` nao e exposto em rotas HTTP publicas; testes invocam o codigo diretamente.
- O prototipo usa memoria volatil por padrao; reiniciar o servidor perde seus dados se nao houver captura externa.
- O `SimuladorLoop` agora fornece `exportarSnapshot()` e `SimuladorLoop.restaurarSnapshot(snapshot)`, que permitem recuperar um estado serializado como JSON **apenas em simulacoes controladas**.
- Os snapshots sao versionados, validados no carregamento e preservam IDs de vendas ja processadas para evitar repeticao apos a restauracao. Ha testes automatizados para pausas, retomadas, ciclos concluidos, arquivo temporario e rejeicao de dados corrompidos.
- **Ha agora um repositorio SQLite para snapshots locais de simulacao** em `src/domain/repositorio-simulacoes-sqlite.js` (Node.js 22+). E uma etapa de laboratorio, **nao o banco definitivo da plataforma**.
- Para usar em codigo de teste: `const repo = new RepositorioSimulacoesSQLite({ caminho: '/caminho/fora/do-repositorio/loop-teste.sqlite' });`, seguido de `repo.salvar({ id: 'cenario-1', simulador, revisaoEsperada: 0 })`. Depois de fechar/reabrir o banco, `repo.recuperar({ id: 'cenario-1' })` retorna o simulador com seu historico e revisao. Alteracoes seguintes exigem a revisao retornada.
- A gravacao SQLite e transacional, com `WAL`, bloqueio de escrita e controle de revisao otimista para evitar sobrescrita silenciosa entre instancias. O arquivo principal recebe permissao `0600` em sistemas Unix.
- **Salvar e uma acao explicita**: ainda nao existe gravacao automatica por evento, retomada automatica no inicio do servidor nem integracao as rotas HTTP.
- A persistencia definitiva precisara transacoes que vinculem vendas reais verificadas, geracao de posicoes, registro de indicacoes, razao contábil e autorizacao administrativa, sem depender de snapshots de memoria.
- O banco de simulacao deve ficar fora da pasta `public/` e fora do repositorio Git; nao armazenar CPF real, dados de cartao, usuarios nem transacoes financeiras nessa etapa.
- Snapshots de simulacoes podem conter nomes e identificadores; **nao os exponha em endpoints publicos, nao os publique no GitHub e nao os use para dados reais de clientes**.
- Em producao, o banco transacional precisa registrar vendas confirmadas, ids unicos, participantes e seus CPFs, indicacoes e timestamps confiaveis; so entao gerar posicoes e eventos de ciclo com idempotencia.
- A catraca publica antiga e o motor novo ainda **nao** foram interligados. O fluxo end-to-end foi testado no orquestrador isolado; isto nao significa que a interface existente ja execute ciclos.
- O financeiro e a autorizacao administrativa precisam ser implementados e auditados antes de qualquer liberacao real.
