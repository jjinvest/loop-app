# LOOP 3.0 / AKITEMM — Ponte de prévia de filas e fotografia histórica

**04/11/2026 · Homologação local, não produção.** PR #1 em DRAFT; sem merge, deploy, saques, posições ou dinheiro real.

## Integração do código
- A prévia de posições `src/domain/projecao-filas-candidato-sandbox.js` lê o mesmo SQLite dos pré-pedidos, da conciliação Asaas Sandbox e das posições pendentes fictícias. Somente um registro com `PAYMENT_RECEIVED`, GET independente PSP `RECEIVED`, titularidade e valor exato R$ 250, sem revisão, pode chegar à **hipótese** de Fila B.
- As classificações da vitrine agora são fotografadas **atomicamente** na mesma transação que cria cada pré-pedido. A tabela `akitemm_vitrine_fotografia_classificacao_prepedido` conserva cor, preço, quantidade, quantidade mínima e revisão por produto. Triggers proíbem UPDATE/DELETE. Reclassificar um produto depois não modifica o pedido anterior.
- A foto só permite simular a Fila B se os itens verdes qualificados somarem R$ 250 e não houver evento especial dependente de autorização. Compras cinzas, eventos sem regulamento e posições anteriores à criação dessa fotografia são marcadas como **não qualificadas/sem evidência**. Não se inventa histórico.
- O `MotorFilas` é construído **somente em memória** com `adesaoPendente:true` e limite conservador de 10 posições na prévia. Não chama tabuleiro, catraca ou motor financeiro. Pagamento revertido sai imediatamente da hipótese sem apagar o histórico.
- No Administrador, `/staging/escritorio-unificado/projecao-filas` exibe quantidades e bloqueios, incluindo revisão PSP, sem fotografia e oferta histórica não qualificada. No cliente, `/staging/minha-previa-filas` só apresenta registros do próprio titular.
- Sem PSP disponível, mostra **sem projeção**. Acima de 1.000 registros, falha fechada para evitar afirmar que uma amostra é integral. Nenhuma consulta dessas rotas chama o PSP externo.

## Restrições
**Prévia não é adesão.** Não há comprovação externa de CPF, aceite definitivo de termos, exercício real de direito, lançamento de posição, entrada na fila, avanço 3A:1B, giro, cofre, bônus, saque ou operação comercial. O código permanece restrito a loopback e recusa produção. A implementação produtiva requer motor persistente, controles de acesso, autorização de pagamento, homologação externa e avaliação jurídica independente.

Os testes de integração verificam a fotografia imutável, reversão PSP, isolamento de titulares, idempotência, limites de leitura e ausência de movimentações reais. A validação de navegador PC/celular verifica os painéis do cliente e administrador. As evidências específicas devem ser conferidas pelo SHA testado.

**Provas finais do bloco 198 (04/11/2026):** [Segurança, fluxo PSP e fotografia histórica — aprovado](https://github.com/jjinvest/loop-app/actions/runs/41817681348); [navegador real PC/celular com prévia no Admin e no Cliente — aprovado](https://github.com/jjinvest/loop-app/actions/runs/41817681338); [capturas reais](https://github.com/jjinvest/loop-app/actions/runs/41817681338/artifacts/13315886479). Todos esses ensaios permanecem sem movimentação de dinheiro, posição real ou giro; PR #1 DRAFT, Marco Zero não liberado.
