# LOOP V6 — Conversão azul → dourada exatamente na entrada da vaga 6

Regra confirmada pelo idealizador em 16/10/2026. **Este documento prevalece sobre descrições antigas que possam sugerir conversão enquanto a posição aguarda nas filas A/B.**

## Ponto de corte

1. Uma compra qualificada cria a posição. Sem CPF fictício de laboratório e aceite dos termos, ela permanece **AZUL / PENDENTE** nas filas A/B. Mesmo que esteja próxima da entrada, a simples espera na fila não altera sua titularidade.
2. Até o instante da chamada da catraca para ingresso na **vaga 6**, o comprador ainda pode validar CPF fictício e aceite expresso dos termos, transformando a posição em ativa (vermelha). Quem já aderiu previamente cria posições ativas.
3. **Quando a posição é retirada da fila para entrar na catraca pela vaga 6**, se ainda estiver pendente, o motor registra a hora de ingresso e converte a posição de **azul para dourada**, com `statusAdesao=PRAZO_ENCERRADO`, `empresa=true`, `titularOperacional=LOOP_EMPRESA` e motivo `SEM_CPF_E_TERMOS_NA_ENTRADA_VAGA_6`.
4. Essa conversão é irreversível para a posição. CPF e termos aceitos posteriormente podem habilitar futuras comissões da conta, mas **não recuperam** a posição dourada.
5. A preparação inicial do tabuleiro preserva a ordem histórica de centro + vagas 1–6, porém cada posição selecionada cruza logicamente a mesma fronteira de entrada pela vaga 6; nenhuma posição azul permanece sem decisão dentro do tabuleiro.
6. A posição dourada mantém seu lugar, entra no centro quando a catraca completar a sequência e, nas seis vendas de seu ciclo, a **1ª, 3ª e 5ª parcelas** passam ao caixa exclusivo `LOOP_DOURADAS`. A **2ª e a 6ª** vão ao investimento (`LOOP_ESQUERDA`); a **4ª** à reserva (`LOOP_DIREITA`).
7. A desistência expressa de uma posição ativa **depois do ingresso na vaga 6** é outra forma de assunção pelo LOOP; o sistema grava motivo `DESISTENTE`, mas usa a **mesma destinação financeira de douradas**. Nenhum crédito é atribuído ao participante original nesses eventos.

## Integridade e limites

- Conversão depende do estado de adesão no **exato ingresso**, não de tempo transcorrido em fila ou de um temporizador.
- Regra implementada no domínio `src/domain/tabuleiro-loop.js` e na classificação de `src/domain/destino-financeiro-centro-loop.js`.
- Verificações automatizadas: `test/entrada-vaga-6-azul-dourado.test.js`, `test/adesao-cores-tabuleiro-demo.test.js`, `test/caixa-douradas-desistentes-loop.test.js`.
- Trata-se somente de **laboratório fictício**. Sem identificação CPF real, pagamentos, saques, estornos ou apropriação real de recursos. Contratos, validade de desistência, CDC/LGPD, políticas financeiras e conformidade regulatória exigem revisão antes de qualquer operação efetiva.
