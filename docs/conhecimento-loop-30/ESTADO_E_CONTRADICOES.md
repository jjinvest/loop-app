# Estado capturado e precedência — 26/11/2026

## Revisões verificadas nas fontes autorizadas

| Objeto | Revisão / estado observado | Limite |
|---|---|---|
| Branch ativa | `6e22deb194ec7f1cd1e0ce596cb1f3ed1f0e2f89` | Não é branch main |
| Base limpa | `a87dd45e63972ea72acddd6cfc75429e9f5329f6` | Marco separado; não assume equivalência de produção |
| Backend loop-identidade-real | mesmoSHA ativo; deploy `7db15a89-4a20-48fd-b601-e8f1bc18b3f5` SUCCESS | Metadado e logs, não prova bancária |
| Gateway akitemm-escritorio-preview | deploy `fa8b78cf-6c62-48aa-984c-f11861d9ecfe` SUCCESS | Metadado do deploy confirma SHA `75ca81142dc7e801529a3e7123707364a3fa6f5c`; pacote do gateway próprio |
| Asaas staging | `605468458dda798b723bfcae06350ae038772705`, deploy `5041ed22-2447-44bb-ba50-f38fe131b399` SUCCESS | Histórico sandbox, não usar como branch principal |
| Domínio | akitemmloop.com.br verificado, TLS válido; CNAME exigido `uacfujj7.up.railway.app` | currentValue vazio no conector, status PROPAGATED; não inventar exportação DNS autoritativa |
| Preservação | branch docs/preservacao-integral-20261126 a partir do ativo | Sem merge/deploy autorizado nesta missão |

## Contradições resolvidas por fonte posterior

| Histórico preservado | Decisão vigente / evidência | Conduta |
|---|---|---|
| V 5 cinco vagas, limites 5/6 | Essência 21/11 e Núcleo 18/11: centro+6, limite 10 por titular/2 na Distribuição | Não reduzir limites nem descartar posições |
| Uma A por titular, desbloqueio vaga 1–6 (18/10) | Núcleo 18/11 permite todas qualificadas em A; motor-filas.liberarEscalonadas confirma coexistência | Não reinstalar trava histórica; manter 3 A:1 B |
| Dourada recebe apenas 1/3/5 (transição 16/10) | Essência 17/11 e DOURADA_INTEGRAL_V2 atual:6 eventos; V1 legado preservado | Novos ciclos V2, sem recalcular legados |
| Saque 3%, mínimoR$ 100 | Decisão 21/10 taxa 0%; regra 23/11 mínimoR$ 25 | Preservar lançamentos históricos |
| Qualquer compra libera link, inclusivecinza | Complemento 23/11:cinza só venda; habilitadores têm política própria | Não criar vínculo/comissão de cinza |
| Campanhas 20–100%, comissão do preço total | Complemento 23/11:10% deR$ 250 por ativação válida =R$ 25 | Campanhas antigas não são padrão vigente |
| Venda sempre gera luz, inclusive sincronização | Modos 17/21/26 nov: fila independente; Distribuição autorizada, livre por vendas e programada por caixa reservado | Não darSTART nem consumir evento na consulta |
| Livre sem horário (06/11), intervalo fixo 10 s | Decisão 26/11:livre 09–18; programado usa meta/janela | Polling 10 s não é regra comercial |
| Bônus só visível depois da catraca ou antecipado do central | Decisão 26/11:direito na confirmação; paga exclusivamente da reserva coberta | Devido/pago/pendente distintos |
| PR#1 DRAFT/antigo serviço como estado global | Revisões/deploys capturados acima | Histórico datado não apaga publicações posteriores |
| Nove registros tratados como clientes | Núcleo/pós-corte 18/11 documentam saneamento e duas contas reconhecidas | Não reimportar ou apagar nada nesta missão |

## Pontos que NÃO recebem aprovação por inferência

- Núcleo 18/11 menciona convite promovendo posições do indicador; módulo atual com travaPromocaoAtiva exige posiçãoAlvoId para vínculo. A coexistência de posições emA está documentada, mas extensão automática de UM vínculo a todas não foi aprovada por esta missão. Confrontar texto, política de vínculo e testes antes de nova alteração.
- Texto de 30 tópicos por posição e aprovação jurídica atual não foram recuperados/certificados aqui. Registro 16/11 é histórico e aponta lacuna, não prova do estado atual de todos os endpoints.
- LARANJA não tem política completa de posições demonstrada; não inferir de outra cor.
- Pacotes de produto roxo/dourado seguem configuração congelada, não exemplos antigos dequantidade por preço.
- Datas 01/12/2026 e 01/01/2027 são metas de lançamento, não autorização automática para operação financeira.
- Não há certificado de 100 mil/milhão de clientes, custódia independente de chaves ou DR produtivo integral.

[Índice geral](README.md). Fontes completas nos segmentos 04–07 e 14; nenhum enunciado de produto foi alterado nesta missão.
