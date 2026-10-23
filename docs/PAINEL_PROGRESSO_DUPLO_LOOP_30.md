# PAINEL DE PROGRESSO — LOOP 3.0 / AKITEMM

Data de instituição: 22/10/2026 (horário de Brasília). Documento de governança, sem efeito no aplicativo ou no motor V6.

## Duas barras independentes

**1. Desenvolvimento técnico do aplicativo**: interfaces aprovadas, regras do motor, persistência e idempotência, loja/pedidos, integrações em laboratório, testes automatizados e navegador. Referência histórica **90% do laboratório**: NÃO é medição atual auditada nem prontidão de lançamento.

**2. Preparação para lançamento comercial**: situação cadastral/fiscal e CNPJ, revisão jurídica do modelo de vendas/indicações/benefícios, aceitação expressa por PSP, homologação Pix ponta a ponta, segurança de produção e antifraude, conciliação financeira, fornecedores/logística, política de estornos/CDC/LGPD, reservas e capacidade de honrar compromissos. **Sem percentual atribuído** até coleta de evidências.

## Critérios de cálculo

Cada barra terá um checklist versionado próprio. Para cada item, registrar: identificador, escopo, evidência verificável (commit, execução CI, documento, contrato, comprovante), responsável, status `PENDENTE | EM_ANDAMENTO | CONCLUIDO | BLOQUEADO`, data de verificação e peso aprovado. **Percentual = 100 × soma dos pesos CONCLUIDOS / soma dos pesos totais**, arredondado para baixo. Item sem evidência não conta. Sem pesos aprovados e inventário completo, exibir **"a aferir"**, jamais inventar número. Mudanças de escopo exigem revisão explícita do denominador; guardar histórico.

## Fotografia inicial — fatos, não porcentagens novas

- PR #1 permanece DRAFT, sem merge/deploy.
- Último registro documentado de suíte: 542/542 testes aprovados (GitHub Actions 39841580582); execução posterior exige conferência específica.
- Asaas Sandbox: confirmação **manual** de cobrança de boleto R$250 informada e observada na conversa em 22/10/2026; não demonstra Pix nem webhook conectado ao LOOP.
- Pix Sandbox ponta a ponta, PSP de produção, regularização fiscal/CNPJ, avaliação jurídica, logística e segurança de produção: pendentes de evidência de conclusão.
- Não criar posições, saldos, saques, cobranças reais, nem liberar operação comercial por mudança de indicador.

## Próxima atualização

Levantar checklist técnico e comercial com pesos submetidos à aprovação; ligar cada conclusão à evidência. A barra histórica de 90% fica explicitamente rotulada como referência antiga, até primeira aferição formal.

**Travas:** preservar telas aprovadas, motor V6, fila A/B, seis eventos, ativações individuais, PR DRAFT e nenhuma integração de produção sem ordem expressa.
