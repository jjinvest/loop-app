# LOOP 3.0 / AKITEMM — auditoria financeira navegável (05/11/2026)

## Integração desta etapa
A auditoria do Escritório do Administrador, já conectada ao mesmo SQLite de pedidos, motor V6, pagamentos Asaas Sandbox, aceites individuais, referências de posições, cofres, bônus e saques fictícios, passou a oferecer navegação por página. Nenhum motor, caixa, direito comercial, regra de preço ou visual previamente aprovado foi substituído.

- `GET /staging/escritorio-unificado/auditoria-cobertura?limite=50&offset=0`: exige credencial de operador; valida exclusivamente `limite` e `offset` numéricos, seguros e não negativos; máximo de cem pedidos por chamada.
- Ordem determinística: `criado_em DESC, prepedido_id DESC`; devolve `paginacao` com próximo e anterior, total de pedidos e quantidade desta página.
- Contadores e somas são **somente da página consultada**, identificados como `escopoDosContadores:'PAGINA_ATUAL_NAO_TOTAL_GLOBAL'`. `pedidosTotal` é o total de cadastro de pré-pedidos, não significa que todos foram auditados na resposta. `amostraParcial` é verdadeira inclusive na última página quando há registros antes dela.
- A auditoria integral exige percorrer todas as páginas; não inventar "zero problema" baseado só na primeira. Novos pedidos inseridos durante a navegação podem alterar offsets: para um fechamento final, congelar um intervalo temporal ou usar uma fotografia imutável da lista de pedidos em um lote posterior, não confiar em contagens de páginas feitas em momentos diferentes.
- A mesma seção de pedidos do Admin oferece botões `Página anterior` / `Próxima página` criados dentro do painel aprovado; os valores são sempre descritos como `CONTADORES DESTA PÁGINA`.
- O mecanismo de alertas globais para lotes órfãos, aceites sem vínculo e destinos de cofre desconhecidos é preservado; ele não valida automaticamente caixa real, KYC externo, margem final nem conformidade regulatória.
- Testes de integração percorrem dois pedidos de um titular com limite de um pedido por página, verificam que os dois IDs aparecem exatamente uma vez, que a última página não tem próximo, que os parâmetros inválidos retornam 400 e que leituras não alteram o banco. Testes do fluxo de PSP e navegador PC/celular permanecem na suíte.

## Riscos e próximos bloqueios
A lista continua protegida, sem uma liberação comercial. Seguem pendentes contratos/documentação dos fornecedores, frete e impostos comprovados, conciliação bancária efetiva, KYC e termos reais revisados, viabilidade e enquadramento jurídico-contábil independente e aprovação explícita do proprietário. A PR #1 permanece DRAFT, sem merge e sem pagamentos reais.

**Arquivos alterados:** `src/domain/auditoria-cobertura-lotes-akitemm.js`, `src/candidato/servidor-loja-escritorio-candidato.js`, `src/candidato/escritorio-admin-candidato-ui.js`, `test/asaas-motor-automatico-sandbox-candidato.test.js`.
