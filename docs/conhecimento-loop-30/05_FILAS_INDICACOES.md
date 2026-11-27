# 05 — Filas e Indicações

Captura documental: 26/11/2026. Base técnica `6e22deb194ec7f1cd1e0ce596cb1f3ed1f0e2f89`. Não altera regras nem certifica operação bancária.

A é amarela/prioritária; B branca/FIFO. Havendo elegíveis nas duas, proporção global 3 A:1 B; sem A, B preenche. Indicação não elimina a vez da B. Posição impedida aguarda sem desaparecer; snapshot preserva quota e desempate.

Ordenação A: mais indicações válidas por posição, depois instante confiável em que completou a mesma quantidade, com desempate residual de evento. Não usar só o primeiro convite nem horário arbitrário enviado pelo cliente. Vínculo de convidado é individual, único, auditável e associado à posição própria elegível; pendente/inativo não ocupa vínculo como se ativo fosse.

A regra histórica de uma única posição por titular aguardando na A foi superada: o Núcleo de 18/11 permite todas as posições qualificadas na A, mantendo máximo 2 apenas na Distribuição. O código atual liberarEscalonadas permite coexistência na A. Não reintroduzir o bloqueio antigo de vaga 1–6. Elegibilidade na A não reserva próxima entrada. Limites atuais: 10 posições ativas por titular; no máximo 2 na Distribuição. Textos antigos de 5/6 cartões são históricos e não alteram o limite vigente.

Minha Equipe e Minhas Posições devem refletir o mesmo vínculo, sem somar contadores artificiais. A documentação de 18/10 registrou pendência do botão Adicionar indicado nos cartões: tratar como pendência histórica a revalidar no código atual, sem afirmar automaticamente que ainda falta ou que já foi entregue. Compra qualificada cria posição mesmo com Distribuição parada; indicações/ordenamento não disparam giros.

Não confundir cadastro pelo link com ativação elegível. Comissão requer qualificação, confirmação e vínculo; a política financeira está no segmento 06.

## Fontes integrais preservadas

- [Núcleo original e atualizações 18/11](../NUCLEO_ORIGINAL_LINHA_DE_RACIOCINIO_LOOP_20261118.md)

- [REGRA_PRIORIDADE_3 A 1 B_POR_POSICAO_LOOP_V6.md](../REGRA_PRIORIDADE_3A1B_POR_POSICAO_LOOP_V6.md)
- [REGRAS_FILAS.md](../REGRAS_FILAS.md)
- [CONTINUIDADE_OPERACIONAL_LOJA_FILAS_PORTEIRA_CATRACA_23 NOV2026.md](../CONTINUIDADE_OPERACIONAL_LOJA_FILAS_PORTEIRA_CATRACA_23NOV2026.md)
- [Código: src/domain/motor-filas.js](../../src/domain/motor-filas.js)
- [Código: src/producao/projecao-filas-relacional-sqlite.js](../../src/producao/projecao-filas-relacional-sqlite.js)
- [Código: src/producao/visao-escritorio-unificada-sqlite.js](../../src/producao/visao-escritorio-unificada-sqlite.js)

[Voltar ao índice geral](README.md).
