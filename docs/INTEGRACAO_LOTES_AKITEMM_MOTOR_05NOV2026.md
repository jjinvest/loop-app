# AKITEMM → pedidos → plano de posições → motor V6 (homologação) | 05/11/2026

## O que foi conectado
- Compra mista é avaliada por função pura compartilhada `src/domain/plano-posicoes-compra-akitemm.js`: CINZA=0; VERDE=min(1, piso de R$250 do conjunto verde qualificado por pedido); DOURADO=1 por unidade; ROXO=quantidade inteira de posições configurada no Admin por unidade.
- O administrador configura ROXO entre 1 e 10, podendo deixá-lo em 0 (não configurado, bloqueado para vinculação). Configuração e revisão são registradas em SQLite com CHECKs, transação e histórico; esquema anterior preservado.
- O checkout de **ensaio** produz fotografia imutável de itens, classe, preço, revisão e plano de posições no mesmo SQLite do Escritório do Cliente, loja e motor. Reclassificação posterior não reescreve o pedido.
- O motor V6 já existente vincula, por **comando manual explícito do operador no laboratório**, o lote inteiro de posições derivadas da fotografia histórica, em uma transação BEGIN IMMEDIATE. IDs de posições distintos, índice de lote e registro único do pré-pedido impedem duplicações. Sob erro, volta tudo (sem posição parcial).
- Trava atômica do máximo de 10 posições ativas por titular, sem divisão ou resto acumulável dos verdes; as regras de entrada nas filas/tabuleiro permanecem do motor existente.
- Compatibilidade com fotografias **legadas**: pedidos antigos sem plano versionado continuam sob regra de uma única posição verde no ensaio; NUNCA são reinterpretados retroativamente como vários dourados ou roxos.
- As cores de **produto** da loja nunca alteram cores/estados das posições do LOOP.

## Evidências
- CI geral + navegador Chromium PC/celular aprovado no [GitHub Actions 42078391010](https://github.com/jjinvest/loop-app/actions/runs/42078391010).
- Testes cobrem: verde R$1.000→1 posição por pedido; três unidades douradas→3; roxo configurado 5→5; misto verde1+dourado2+roxo5→8; acima de dez bloqueia transação; chamada repetida não duplica; isolamento de titulares; SQLite reaberto mantém lote; pedido HTTP, fotografia histórica, rota de operador e consulta do Cliente usam a mesma fonte.
- Branch `feature/unificar-escritorio-real-20261105` no código testado `d66a6ad014afa9773b7d56bc2cc828e06cf027e8`.

## Limites antes da operação comercial
- O vínculo com o motor é **somente no ambiente protegido de ensaio**, exigindo comando explícito de operador; **não existe ativação comercial automática pelo recebimento de Pix nesta versão**. Pré-pedido isolado, webhook bruto e edição de cor não geram posição real.
- Não há movimentação de saldos comerciais, cofres, indicação, saques, entrega física nem liquidação bancária. Direito real requer validação de pagamento independente, CPF/termos, antifraude, conciliação financeira, reserva e revisão jurídica aplicável.
- Frete não conta na base de R$250 dos verdes; confirmação de pedido real deve calcular frete e validar capacidade ANTES de aceitar cobrança, não após.
- Fotos originais das telas do LOOP ficam preservadas; a única alteração UI deste lote foi adicionar campo numérico ROXO dentro do formulário administrativo **existente**.

## Próximo bloco seguro
Reconciliar provedores de pagamento com ordem/pedido e confirmação de KYC+termos, e definir se eventuais posições especiais geram 1 ou N eventos válidos de catraca. Não inferir eventos de catraca de posições: esse é um eixo separado de negócio.
