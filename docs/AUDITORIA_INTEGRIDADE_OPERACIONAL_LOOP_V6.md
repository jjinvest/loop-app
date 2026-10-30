# LOOP V6 — Auditoria operacional cruzada (laboratório)

A interface visual permanece congelada nesta etapa. O endpoint de diagnóstico **não altera** tabuleiro, filas, caixa, pedido, compra, bônus ou posição. Apenas compara as fontes originais fictícias com o estado da catraca.

## O que confere

1. Cada posição originada por compra tem um ID único e mantém vínculo ao titular do pedido, incluindo as posições extras dos pacotes.
2. Cada posição dourada criada pelo administrador continua pertencendo ao `LOOP_EMPRESA`, está marcada `POSICAO_LOOP`, não tem pedido e não vira fila A por indicações.
3. O índice interno de compras do motor tem de apontar para as mesmas posições e IDs registradas no SQLite; não admite posição sem origem ou venda de motor sem compra.
4. Uma posição azul não pode estar dentro do tabuleiro depois da entrada pela vaga 6; a empresa não pode assumir uma compra enquanto ela ainda está na fila A/B.
5. Desistências expressas, posições ativas e os aceites fictícios precisam ser consistentes com seus registros anteriores.
6. Cada posição do motor deve estar em apenas um lugar ativo ou em um centro histórico de ciclo concluído.
7. A rotina primeiro recupera e valida o snapshot, incluindo destinos dos cofres dos seis eventos (reforço entregue na etapa anterior).

## Acesso

Somente administrador do laboratório com chave válida:

`GET /api/admin/ponte-compras-convites-demo/auditoria-integridade`

Resposta sintética:
```json
{
  "modo":"AUDITORIA_INTEGRIDADE_SOMENTE_LABORATORIO",
  "integridade":"SEM_DIVERGENCIAS_DETECTADAS",
  "totalAlertas":0,
  "alertas":[],
  "alertasTruncados":false,
  "indicadores":{"comprasQualificadas":0,"posicoesAdicionais":0,"douradasManuais":0,
    "desistenciasExpressas":0,"posicoesAtivadasRegistradas":0,
    "posicoesComOrigemContabil":0,"posicoesIdentificadasNoMotor":0,
    "ciclosConcluidos":0,"eventosNoCicloAtual":0},
  "semMovimentacao":true,
  "saldosBancariosVerificados":false,
  "comprovantesReaisVerificados":false,
  "auditoriaContabilIndependente":false,
  "nenhumDadoPessoalExposto":true
}
```

Os alertas possuem **código técnico e número da posição**, nunca CPF, nome, e-mail, senha ou ID da conta. São exibidos até 100 exemplos; `totalAlertas` preserva a contagem, e `alertasTruncados` informa quando há mais de 100. A ausência de divergência significa **apenas** que estas invariantes foram conferidas no laboratório; não significa aprovação jurídica, suficiência financeira, auditoria contábil, comprovação bancária ou segurança de produção.

## Testes

`test/auditoria-integridade-operacional-v6.test.js` cobre base vazia, compras legítimas, douradas manuais, aceitação de termos, desistência, detecção de adulteração do snapshot, titularidade divergente, posição sem origem, acesso administrativo sem autenticação e imutabilidade do estado quando a auditoria é executada.

Sem alteração de layout, sem merge, sem implantação e sem transferência real de recursos.
