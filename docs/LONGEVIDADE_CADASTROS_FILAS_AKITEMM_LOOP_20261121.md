# Longevidade de cadastros e filas — AKITEMM / LOOP 3.0

## Meta

Uma base cumulativa de 10, 1.000, 100.000, 1.000.000+ titulares ao longo de anos. Isso não significa milhões de acessos simultâneos nem milhões de posições ativas; essas capacidades são distintas e exigem testes próprios.

Preservar: identidade única, indicação, histórico de compras, ordem A/B, posições, estados da catraca, financeiro e trilha imutável. Invariantes: 3A:1B, 10 posições ativas por titular, 2 no tabuleiro, centro com 6 eventos. Migração nunca pode criar dinheiro, benefícios ou posições.

## Conclusões técnicas — 21/11/2026

- Cadastro e vínculos já estão em tabelas SQLite persistentes com chaves únicas e referências.
- Índice cumulativo de indicação por indicador, horário e ID de indicado preserva ordem determinística inclusive nos empates, com paginação de 50.
- Auditoria do motor agora percorre compras, eventos e qualificações incrementalmente em vez de produzir arrays históricos completos e verificações quadráticas. Consulta global não duplica as posições do motor.
- Teste descartável reabre arquivo real SQLite com 20 mil contas e 20 mil vínculos sintéticos, conferindo ordem, última página, escolha de destino e integridade. Não equivale a 20 mil logins reais nem a teste de throughput.
- LIMITAÇÃO: o motor persiste filas, tabuleiro e histórico em um só snapshot JSON (tabela loop_real_motor_estado). Leitura/escrita de uma posição requer materializar estado proporcional à sua dimensão. Não há prova de suporte a milhões de posições ativas nesse formato.

## Próxima evolução sem regressão

1. Preservar e validar snapshot original, backups restauráveis, identificadores e hashes; não migrar a quente sem restauração testada.
2. Construir armazenamento relacional de entradas e movimentos, com índices de ordem A/B, por titular, por posição e por evento. Histórico append-only e paginação por cursor, sem varrer todas as posições em uma consulta.
3. Fazer projeção paralela apenas de leitura; comparar contagem, titularidade, classificação, prioridade A/B, posição no tabuleiro, datas e eventos. Divergência impede troca automática.
4. Medir cargas distintas de 10 mil, 100 mil, 1 milhão: titulares cadastrados, posições, movimentos históricos, simultaneidade operacional, disco, CPU, RAM, tempos P95/P99, backup/restore. Dados sintéticos somente em ambientes descartáveis.
5. Trocar fonte de verdade somente após consistência, idempotência, recuperação e testes de regressão completos; sem alteração das telas aprovadas ou liberação implícita de fornecedores, PSP, saques e bônus.

## Etapa seguinte — arquivo relacional de ciclos concluídos (21/11/2026)

- Os ciclos concluídos passam a ter uma **projeção relacional append-only** com chave de ciclo, centro, conteúdo serializado, hash SHA-256 encadeado ao ciclo anterior e seis eventos por ciclo (ou cinco nos históricos legados).
- A inserção dos ciclos novos ocorre na **mesma transação** que grava o snapshot e a projeção A/B. Uma falha reverte a gravação inteira; nenhuma rotina de histórico pode autorizar giro ou pagamento.
- A auditoria completa e os backups conferem todo o encadeamento e os eventos com o snapshot original; a escrita comum só verifica o último ciclo e acrescenta os novos. Sem reescrever os ciclos já fechados.
- Backups antigos que ainda não contêm o arquivo de ciclos continuam restauráveis; na abertura subsequente o histórico é projetado sem trocar IDs ou alterar o snapshot.
- Ensaio sintético isolado: 5.000 ciclos / 30.000 eventos, paginação por ciclo e reprocessamento sem registros duplicados. Não representa 5.000 movimentações financeiras reais nem prova 1.000.000 de posições.
- **Limite mantido:** o snapshot JSON do simulador **continua como fonte de verdade** e contém cópia de todo o histórico; não há redução comprovada do seu custo de regravação. Somente depois de uma migração com dual-read, restore e comparação de todas as regras poderá sair a cópia histórica central.

## Etapa de contrato de snapshot enxuto — CANDIDATO V2

- Novo módulo `snapshot-historico-externo-candidato.js` gera uma **cópia somente-leitura** do estado do motor, retirando dessa cópia o array de `ciclosConcluidos`, substituído por referência de versão, revisão do estado e resumo de SHA-256 do diário relacional já existente.
- A reconstituição lê o arquivo de ciclos e seus eventos **sem confiar na cópia do snapshot**; confere ordem, quantidade, centro, eventos, hashes encadeados, revisão do motor e igualdade SHA-256 do JSON restaurado com o original.
- O módulo recusa snapshot ausente, arquivo corrompido, candidato adulterado, versão antiga e histórico divergente. Não executa `UPDATE`, `INSERT`, pagamento, saque, pedido ou giro.
- **Não está ativado como persistência principal.** O snapshot V1 completo continua no banco, porque leitores antigos (aceite, estorno, promoção de lotes, auditorias) ainda dependem dele. Este estágio prova a reversibilidade antes da substituição; ainda não reduz tamanho/tempo de gravação produtivo.
- **Critério para ativar V2:** inventariar e migrar TODOS os leitores/escritores do snapshot, permitir estado compacto com restauração segura em um só gateway transacional, conferir restore de backup e ida/volta entre versões, e rodar cargas de 10 mil/100 mil/1 milhão separadamente para cadastros, posições e eventos, sempre sem dinheiro real fictício.

## Migração transacional V1 → V2 com gateway único

- Implementado `estado-motor-unificado-sqlite.js`: ponto de acesso com leitura V1/V2, revisão otimista, validação de SHA-256 da cadeia de ciclos, reconstrução do snapshot V1 lógico e gravação V2 **dentro da mesma transação**. Estado V2 já migrado não regride ao formato V1 numa nova operação.
- Motor, projeções, auditoria, aceite individual de posição azul, promoção verde e promoções em lote utilizam o gateway para evitar gravadores incompatíveis. A leitura antiga ainda é válida em bancos não migrados.
- `motor.migrarHistoricoExterno()` converte o armazenamento de maneira atômica, incluindo uma base vazia, sem compras, giros, saques ou bônus. Não é endpoint público. A ativação na operação interna real exige sinal explícito `LOOP_REAL_SNAPSHOT_V2_MIGRAR=SIM`, cadastro fechado e backup offsite restaurável **antes e depois**. Sem a segunda prova, o listener não abre. Implantar primeiro os leitores V2 compatíveis e apenas depois ativar a migração.
- Os ciclos continuam no histórico relacional imutável, e o snapshot gravado V2 mantém somente referência à cadeia e checksum do JSON V1. Leituras V2 reconstituem e revalidam o snapshot completo; corrupção ou perda de referência impede a operação.
- **Limitação importante:** o motor do domínio ainda reconstrói e valida todos os ciclos em memória. A migração V2 reduz armazenamento/regravação do histórico no registro central, **não** prova tempo constante por operação nem suporte para milhões de ciclos/posições. Isso exige remodelar o processamento de estado para eventos/posições indexados sem carregar todo o passado.

## Prova cumulativa isolada de 100 mil → 1 milhão de vínculos

- Executável `scripts/provar-carga-continua-100k-1m-loop.js`: usa **o mesmo arquivo SQLite durante todo o ensaio**, acrescentando 5.000 contas/vínculos sintéticos por transação (sem zerar os dados). Marcos: 100 mil, 250 mil, 500 mil, 750 mil e 1 milhão. Faz leitura paginada e mede duração de gravação e consulta durante o crescimento, em vez de somente após a carga.
- **Continuidade comprovável:** a cada marco o processo Node termina, o banco é reaberto por outro processo e continua do total já confirmado. Depois dos 100 mil, há uma interrupção intencional antes do `COMMIT`, seguida de recuperação automática: as 100 gravações incompletas devem ser revertidas e o ensaio precisa continuar.
- A checagem valida índices e ordenação determinística da fila de cadastro, ausência de duplicações, `PRAGMA integrity_check`, chaves estrangeiras, inexistência de compras e giros, e o funcionamento de **uma inscrição pelo caminho real de cadastro** depois de 1 milhão de registros sintéticos. Os registros de carga não representam 1 milhão de contas autenticadas por senha, pessoas reais, pedidos ou pagamento.
- Execução automática no **GitHub Actions em runner efêmero isolado**, sem volume Railway, chaves de PSP ou base de clientes; usa exclusivamente diretório temporário e apaga a cópia de ensaio ao terminar. A prova é reexecutável; a saída contém tempos, total e volume em disco, sem dados identificáveis.
- **Escopo e limites:** crescimento de cadastros e vínculos na estrutura SQLite; **não comprova 1 milhão de posições de fila, milhões de sessões concorrentes ou latência da aplicação sob tráfego HTTP sustentado**. Para isso são necessários testes independentes do motor de posições e de tráfego com métricas de CPU, memória, latência p95/p99, reinício e capacidade do ambiente real.

## Expansão de consultas e persistência relacional acumulada — 21/11/2026

- `Minha Rede`: páginas agora usam cursor HMAC autenticado, vinculado ao titular e à posição da última linha, com leitura `registrado_em/indicado_id` pelo índice composto. Preserva desempates, telefones, destinos e números de cadastro. O parâmetro `offset` antigo continua funcionando para clientes legados; o novo formulário usa cursor por padrão. Tokens de outro titular ou adulterados são rejeitados, sem retornar dados.
- O resumo de indicações separa contagem da rede, participantes com compras e qualificados. Assim não executa uma consulta correlacionada para cada um dos 1 milhão de vínculos em redes sem compras; a semântica original das contagens permanece. O tempo real é medido no CI em 1 milhão de vínculos acumulados, incluindo a versão antiga para comparação.
- O espelho de posições suporta `aposOrdem` para consultar páginas indexadas de filas A/B, preservando `offset` legado. Nenhuma ordem, regra 3A:1B, 10 posições ou motor original foi alterada.
- Ensaio independente **de estrutura relacional**, em uma única base SQLite temporária, reaberta entre etapas: 100 mil → 250 mil → 500 mil → 750 mil → **1 milhão de linhas indexadas de posições sintéticas**, 3A:1B na distribuição da tabela; e 10 mil → 50 mil → **100 mil ciclos históricos e 600 mil eventos sintéticos**. Confere índices, imutabilidade, chave estrangeira, hash encadeado, ordenação e recuperação de transação interrompida. Não executa esse volume no Railway nem nas contas de clientes.
- **Distinção obrigatória:** inserir 1 milhão de linhas no **espelho relacional** não significa criar ou processar 1 milhão de posições *ativas pelo motor de negócios*. O simulador V6 ainda reconstrói o estado lógico e não há comprovação de milhão de posições ativas, simultaneidade HTTP, memória de longa duração ou ciclo real de compra→fila→tabuleiro→pagamento nessa escala. Para esse passo, retirar o custo de reconstrução de todas as filas em cada operação e medir worker real separado, preservando as regras e caixa.

## Estado

Longevidade do índice e da auditoria reforçada. Um milhão de registros e posições não está comprovado; a remodelagem do snapshot e as medições volumétricas ainda são necessárias.
