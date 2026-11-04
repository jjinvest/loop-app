# LOOP 3.0 / AKITEMM — Convergência de recebimentos e isolamento dos Escritórios

04/11/2026 · Seção 204 · Candidato local de homologação

## Falhas reproduzidas

1. A consulta individual da prévia das posições contava e carregava toda a tabela antes de filtrar o titular. Com 1.001 registros de outra conta, uma sessão com um único registro recebia HTTP 503 `MAXIMO_ANALISE_SEGURA_EXCEDIDO`.
2. O resumo administrativo contava qualquer `RECEIVED` antigo. Se um novo GET PSP retornasse `PENDING`, o detalhe do Cliente e do Admin deixava de comprovar o recebimento, mas o contador geral permanecia positivo.

As duas falhas foram reproduzidas por regressões antes das respectivas correções.

## Correções

- `ProjecaoFilasCandidatoSandbox` aplica `WHERE titular_id=?` no SQLite antes de contar, limitar ou ler registros. Não consulta posição, fotografia ou pré-adesão de terceiros na sessão individual. O limite hipotético de dez continua por titular; pagamentos em revisão não consomem vagas válidas. `ordemHipotetica` individual representa somente a ordem local desse titular, explicitada em `escopoOrdemHipotetica`, sem prometer ordem global ou posição definitiva.
- O resumo compartilhado do Escritório usa a última consulta registrada do pagamento vinculado, exatamente um evento recebido com reconsulta concluída e nenhuma revisão nesse pagamento, conferindo o vínculo do titular e recusando duplicação legada de posições. O cálculo considera a base inteira, independentemente do limite da lista visível. Histórico de consultas, posições e entregas permanece intacto.
- Ambas são leituras locais: nenhuma consulta ao PSP, gravação, ativação ou repasse acontece ao abrir os Escritórios. O roteamento e as telas aprovadas não foram redesenhados.

## Verificação

- Testes HTTP sobre conta única, pré-pedido, PSP fictício, posição e entrega: consulta individual continua respondendo 200 com 1.001 registros artificiais de terceiros; Cliente e Admin convergem em `RECEIVED → PENDING → status desconhecido → RECEIVED`, preservando histórico. As linhas artificiais de escala são descartadas por rollback da fixture, não gravadas como compradores reais.
- Fixture independente com 45 pré-pedidos: total global coincide com diagnóstico individual, mesmo mostrando somente um pedido; cobre ausência de GET, último status divergente, eventos duplicados, revisão, titular errado, duplicação legada e consulta de pagamento diferente. Reabre arquivo SQLite somente leitura e confere zero gravações.
- Escopo individual mantém dez hipóteses válidas e distingue o excedente e a revisão sem ler outro titular.
- Novo roteiro Chromium `scripts/validar-convergencia-psp-candidato-browser.js`: uma cobrança inteiramente fictícia, ambos os Escritórios e histórico preservado em PC/celular. O Chromium não está instalado no executor local; a execução deverá ser confirmada no CI, que possui instalação explícita do navegador. Nenhuma aprovação de navegador é presumida antes desse resultado.

## Limites e continuidade

A consulta administrativa global mantém o limite de segurança de 1.000 registros; este bloco elimina a interferência entre contas na consulta individual e não implementa paginação administrativa acima desse teto. A prévia segue hipotética e não comprova capacidade do motor persistente comercial. Permanecem pendentes e-mail externo/domínio e credenciais configurados, identidade externa, pagamento comercial conciliado e integração/homologação da ativação definitiva no motor. A PR permanece DRAFT. Nenhum serviço Railway ou configuração DNS foi alterado.

A etapa anterior de e-mail, seção 203, foi conferida no HEAD de entrada: [CI de segurança aprovado](https://github.com/jjinvest/loop-app/actions/runs/41886103065) e [navegador aprovado](https://github.com/jjinvest/loop-app/actions/runs/41886103739). Isso não substitui o CI das correções desta seção.
