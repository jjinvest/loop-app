# LOOP 3.0 / AKITEMM — cobertura de compra mista por posição
**Data:** 05/11/2026 · **Ambiente:** homologação privada · **Status:** auditoria técnica de valores, não aprovação comercial

## Objetivo
Impedir que um pedido gerando N posições seja confundido com N recebimentos comerciais, e que preço bruto de mercadoria seja tratado como caixa livre. A mesma fotografia histórica usada pelo motor é a fonte do cálculo **sem recalcular direitos por preço após a compra**.

## Regra de conferência
- Classes da LOJA: CINZA = 0; VERDE = no máximo 1 por pedido com subtotal verde elegível >= R$ 250; DOURADO = 1 por unidade; ROXO = quantidade explicitamente configurada por unidade. Nunca misturar esses nomes com estados e cores das posições do LOOP.
- `referenciaBrutaMinima = quantidadePosicoesPlanejadas × R$ 250`. Esse é apenas o valor referencial de aporte por posição; **não prova que a obrigação futura está coberta**. Se o valor bruto total do pedido for menor, há insuficiência aritmética incontornável na própria compra.
- `saldoAposCustos = valorBruto - fornecedor - PSP - tributos - freteSuportado - reservaReembolsos - bonusPrevistos - outrosCustos - referenciaBrutaMinima`. Todos os campos de custo são necessários; ausência ou dado declarado sem comprovação NÃO autoriza operação.
- `exposicaoCondicionalSeTodasConcluirem = N × R$ 750`. É cenário de estresse do benefício pretendido por posição concluída; não é dívida bancária liquidada nem promessa. Os seis eventos comerciais que alimentam um giro são separados das N posições originadas de um pedido roxo/dourado.
- Custo, frete, impostos, saldo bancário liquidado, entrega, contrato de fornecedor e validade jurídica **não podem ser inferidos** do preço anunciado ou do Asaas Sandbox. Caixa disponível e saques reais permanecem zero.
- Não autoriza gasto, crédito, comissão, giro, estorno comercial, reserva bancária ou pagamento. A auditoria é 100% somente leitura e inclui bloqueios explícitos de Marco Zero.

## Casos concretos
| Cenário | Posições | Referência mínima (não é passivo total) | Diferença bruta antes de custos |
| --- | ---: | ---: | ---: |
| R$ 1.000 só de verdes, em UM pedido | 1 | R$ 250 | R$ 750 |
| Duas unidades douradas de R$ 500 | 2 | R$ 500 | R$ 500 |
| Carro roxo vendido por R$ 10.000, configurado para 5 posições | 5 | R$ 1.250 | R$ 8.750 |
| Produto roxo de R$ 250, indevidamente configurado para 5 posições | 5 | R$ 1.250 | **-R$ 1.000** |
| Carro roxo R$ 10.000, fornecedor estimado em R$ 9.000 (sem demais custos) | 5 | R$ 1.250 | **-R$ 250 depois do fornecedor** |
| Verdes R$ 300 (1), 2 dourados R$ 350 (2), roxo 5 pos (5) | 8 | R$ 2.000 | Depende do preço do roxo e dos custos |

## Evidência e rastreabilidade
- Função pura `src/domain/auditoria-cobertura-lotes-akitemm.js` usa `planejarPosicoesCompraAkitemm` para conferir o plano guardado, centavos inteiros e número de posições, e recusa fotografias alteradas ou custos parciais.
- Consulta autenticada **GET /staging/escritorio-unificado/auditoria-cobertura** (máximo 100 pedidos por chamada; página inicial 50) mostra estado sem CPF, nick ou identificador de titular. Indica amostra parcial quando houver mais registros que o limite.
- Um botão `Conferir referência e custos` foi adicionado **ao painel atual do Escritório do Administrador**, na seção de Pedidos. Não há nova aba, serviço paralelo, cor da loja transferida à posição, nem cálculo sacável.
- Relatórios mostram status da reconsulta PSP de homologação, contagem do lote no motor, alerta de lote que supera o plano e registro que perdeu confirmação PSP.
- Testes de cenários monetários incluem verde R$ 1.000, múltiplos dourados, roxo com cinco posições, fornecedor, combinação de classes, manipulação de valores, privacidade e controle de acesso HTTP.

## Bloqueios que dependem de terceiros / decisão do titular da empresa
- Preços reais e condições do fornecedor/distribuidor, prazos de entrega e frete, impostos e custos operacionais documentados. Sem contrato, não marcar custos como comprovados.
- Extratos de liquidação bancária/PSP, reconciliação independente e política de reservas/reembolsos/chargeback, não substituídos por status Sandbox.
- Serviço de KYC externo contratado, termos reais/LGPD revisados e prova de identidade. CPF fictício na prévia não equivale a confirmação externa.
- Parecer jurídico/contábil independente sobre remuneração vinculada a compras, indicações, pagamentos e adequação legal; comprovação do caixa/obrigações.
- Aprovação explícita do proprietário **só depois** das evidências. Permanece bloqueado iniciar cobrança e saque reais sem isso.

**Não modificar PR #1 DRAFT, não fazer merge/deploy comercial, não afirmar solvência pela ausência de alertas locais.**

## Blindagem adicional — saldo de um produto não pode mascarar outro (05/11, revisão)
- A avaliação considera o bruto **do grupo VERDE apenas quando ele qualifica**, **cada linha DOURADA** e **cada linha ROXA separadamente**. Produtos CINZA e verdes abaixo de R$ 250 não são usados para encobrir uma oferta roxa sem referência suficiente. Uma oferta roxa cara tampouco mascara outra roxa mais barata e deficitária na mesma compra.
- Exemplo: uma mercadoria CINZA de R$ 1.000 mais um evento ROXO de R$ 250 que promete cinco posições totaliza R$ 1.250. A conta global daria diferença zero sobre 5 × R$ 250; **o evento ROXO continua com déficit individual de R$ 1.000**. O painel sinaliza `SEGMENTO_SEM_COBERTURA_BRUTA`, exibe a classe/produto deficitário sem identificação do comprador e mantém Marco Zero bloqueado.
- A ponte de pré-pedido Asaas Sandbox agora inclui o parâmetro estrito **`exigirCoberturaBruta:true`**, executado **antes de qualquer POST Pix ao PSP e antes de reservar a tentativa de envio**. Quando a fotografia diverge, a oferta roxa está sem configuração, há posições acima de dez ou falta referência bruta individual, o ensaio estrito recusa a emissão e mantém a cobrança em estado PREPARADA. **Esse modo ainda não substitui verificação de fornecedor, frete, impostos, KYC, banco e parecer jurídico**, e não autoriza cobranças comerciais.
- Para garantir os testes negativos já aprovados, o modo **legado do laboratório permanece permissivo por padrão**, permitindo simular especificamente pedidos sem cobertura e suas reversões. **O modo estrito é opt-in nesta versão; não declarar um bloqueio universal aplicado ao checkout real ou a todas as cobranças de teste.**
- Testes incluem produto cinza caro encobrindo roxo barato, dois roxos com custos cruzados, verde abaixo do piso, valor total que aparenta estar coberto e rejeição do modo estrito sem sequer chamar o PSP. Nenhuma posição, cofre ou cor do LOOP foi alterada por esta conferência.
