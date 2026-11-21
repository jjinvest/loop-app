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

## Estado

Longevidade do índice e da auditoria reforçada. Um milhão de registros e posições não está comprovado; a remodelagem do snapshot e as medições volumétricas ainda são necessárias.
