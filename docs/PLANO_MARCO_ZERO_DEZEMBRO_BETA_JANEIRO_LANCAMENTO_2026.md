# LOOP 3.0 / AKITEMM — caminho de lançamento: 01/12/2026 e janeiro de 2027

**Atualizado:** 06/11/2026. **Situação:** planejamento executivo; não é certificado de prontidão.  
**Fonte de execução:** código e provas na branch `feature/unificar-escritorio-real-20261105`; PR #1 na branch `fix/teste-escrita-catraca-20261014` continua **DRAFT**. Não mergear ou habilitar produção sem decisão explícita e gates concluídos.

## Estratégia de duas etapas

- **01 a 30/12/2026 — piloto de 30 dias, controlado.** Meta é validar cadastro, navegação, loja, pedidos, atendimento, capacidade, integração de pagamento e motor em homologação com um grupo definido de testadores. Quando ainda houver P0 jurídico, econômico, financeiro ou operacional: **somente testes sem dinheiro, sem promessa de rendimento, sem posições remuneradas, sem saques e sem incentivo financeiro a recrutamento.** Cadastro de interessados/convites somente após políticas de privacidade, termos e consentimento adequados. Qualquer venda de produtos reais na fase piloto exige antes aprovações independentes dos fluxos comerciais e consumeristas, incluindo fornecedor, estoque/logística, checkout, impostos e pagamentos; a venda independente do produto **não implica entrada no LOOP**.
- **Janeiro de 2027 — objetivo de abertura oficial**, sujeito a todos os gates P0 aprovados, à correção dos defeitos encontrados no piloto e à autorização de publicação. A data não converte piloto em operação autorizada nem substitui a prova de viabilidade. Se P0 não aprovado, manter apenas o laboratório até resolver.

## Critério operacional: contar pendências eliminadas, não testes repetidos

| Frente / gate | Evidência mínima para marcar CONCLUÍDO | Situação em 06/11 |
| --- | --- | --- |
| G1 — Asaas Sandbox remoto autenticado | GET autenticado sem segredos nos logs | **CONCLUÍDO em homologação**; `docs/PROVA_REMOTA_ASAAS_SANDBOX_RAILWAY_20261106.md` |
| G2 — Pix, posição, indicação, tabuleiro e giro em homologação | Compras PSP Sandbox confirmadas → webhook e conciliação → posições no SQLite → convite e promoção da fila B para A → seis eventos distintos → giro com catraca liberada | **CONCLUÍDO NO SANDBOX**; prova de 2 clientes e convite (Railway `32f02fbd`) e prova ampliada com **6 Pix de R$250 conciliados, 7 posições no tabuleiro, 6 eventos válidos e 1 giro com catraca/pausa e centro atualizado** (Railway `36fc6efb`). Ver `docs/PROVA_SEIS_PIX_SANDBOX_GIRO_CATRACA_RAILWAY_20261106.md`. Sem dinheiro, saque ou checkout comercial real |
| G3 — Retentativas e concorrência externas | Replay do mesmo webhook, reinício em pontos críticos, nenhuma duplicação de cobrança/posição/crédito, revisão visível | **PARCIAL**; Pix Sandbox com posição única, 6 notificações de replay HTTPS sem duplicação, persistência após reinício, e **retomada de reconsulta PROCESSANDO em SQLite reaberto**, nova prova PSP, segunda queda bloqueada e indicadores no admin; evidência `docs/RECUPERACAO_RECONSULTA_PSP_INTERRUPPIDA_20261106.md`. Ainda faltam corte real de processo em transação, retry originado pelo Asaas e concorrência multi-instância |
| G4 — Carga e estabilidade | Cenários representativos de cadastro, compra, consulta, webhook e motor, métricas p95/p99, limites e controle de 5xx, reprodução sem segredos | **PARCIAL**; smoke externo read-only 166 GET, 0 falhas, p95=411 ms, pico=1.188 ms, 8 concorrentes, executado no Railway 06/11. Não atesta 10.000 clientes |
| G5 — Backup / RPO / RTO | Restaurar cópia criptografada em ambiente isolado, provar mesma titularidade/posições, medir minutos de perda máxima de dados e tempo de recuperação, rodar com volume real de laboratório | **PARCIAL**; cópia criptografada S3 foi restaurada em contêiner isolado no Railway (1 posição preservada; idade da cópia 14 min; tempo observado 2 s); ver `docs/PROVA_RESTAURACAO_OFFSITE_ISOLADA_RAILWAY_20261106.md`. Falta cenário de desastre, outra região/provedor, repetição, RPO/RTO com garantias |
| G6 — Privacidade e segurança | Revisão de autenticação, CSRF, autorização horizontal, segredo/backup, dados pessoais, retenção, LGPD, abuso, incidentes e auditoria independente | **PARCIAL** — credencial operador distinta do visitante e invalidação de cookie antigo, com prova HTTPS de 9 caminhos bloqueados (`docs/SEGREGACAO_ADMIN_CLIENTE_RAILWAY_20261106.md`). Faltam revisão horizontal, CSRF, privacidade e consentimento para pessoas reais, isolamento do piloto, abuso, pentest e auditoria independente; não abrir público ainda. |
| G7 — Loja real, fornecedores e consumidor | Produtos com origem/licenças, disponibilidade, custo e margem, entrega/rastreamento, nota fiscal, SAC, arrependimento e política consumerista conforme aplicável, checkout produtivo independente | **ABERTO** |
| G8 — Legalidade do incentivo e dos ciclos | Parecer jurídico independente, específico para esquema de indicação/filas/ciclos, retorno condicionado a novas compras, comissionamento, publicidade, direito do consumidor e regras aplicáveis no Brasil | **ABERTO — BLOQUEIA qualquer propaganda de ganho/participação remunerada** |
| G9 — Sustentabilidade financeira e reservas | Modelo de caixa por cohort e cenário adverso (sem novas adesões), cobertura comprovada de obrigações condicionais, custos, comissões, impostos, estornos, liquidez e auditoria independente | **ABERTO — BLOQUEIA captação e promessas financeiras** |
| G10 — Decisão final de operação | Gates aprovados, roteiro de suporte/incident response, responsável pelo go/no-go, versão/tag auditável, aprovação explícita para mudança de ambientes | **ABERTO** |

## Janelas de execução com entrega demonstrável

1. **06–12/11:** estabilizar ambiente único; evidenciar entrega/retentativa de webhook, idempotência externa e efeitos corretos; aumentar teste de leitura sem modificar pagamentos reais.
2. **13–19/11:** evidenciar restart, backup/offsite e restauração isolada com tempos; carga gradual e limites; corrigir falhas reproduzidas.
3. **20–26/11:** preparar checkout de produto independente, fornecedores e atendimento; fechar privacidade, políticas e pareceres jurídico/financeiro. Não habilitar operações reais sem autorização e documentação.
4. **27–30/11:** revisão go/no-go, testes integrados de ponta a ponta, instruções do piloto, plano de reversão e congelamento controlado da versão de homologação.
5. **01–30/12:** piloto restrito monitorado (sem dinheiro ou renda prometida enquanto G7/G8/G9 estiverem abertos); coletar defeitos, corrigir e medir. Vendas de produtos independentes somente se o fluxo comercial tiver aprovação própria.
6. **Janeiro/2027:** abertura oficial apenas após os gates e resultados do piloto, nunca automaticamente pelo calendário.

## Mudanças preservadas / riscos de comunicação

- Preservar identidade visual aprovada e a fonte única entre loja, escritório e motor; não reconstruir telas separadas.
- Fila A prioritária 3:1 sobre B; limite de 10 posições simultâneas por titular, máximo 2 do mesmo titular no tabuleiro; 1 compra verde elegível >= R$250 gera no máximo 1 posição por carrinho; compras de produto continuam permitidas sem posição quando não elegíveis ou sem capacidade, mediante ciência clara. Dourado e roxo segundo configuração específica, não por multiplicação arbitrária do preço.
- **Não divulgar** “compre R$250 e receba R$750”, retorno garantido, avanço pago ou indicação remunerada em campanhas públicas enquanto G8/G9 permanecerem abertos. O fato de haver aceite digital ou sandbox funcional não sana riscos de legalidade e solvência.
- **Nenhum estorno** como regra interna do LOOP não pode afastar direitos legais do consumidor; a revisão jurídica deverá conciliar as políticas com a legislação aplicável.
- Nunca registrar credenciais, CPF, números de cobranças ou dados reais de testadores em documentação de CI/GitHub.

## Registro da evidência de estabilidade externa 06/11

Deploy Railway `7c10c899-534c-4145-9c74-f7aa08bf0dbb`, comando de uso único `scripts/medir-carga-leitura-preview-railway.js`: 160 GET `/healthz` concorrência máxima 8, mais 6 GET `/readyz` autenticados e sequenciais. **166/166 HTTP e JSON esperados; 0 erros; p50 92 ms; p95 411 ms; máximo 1.188 ms.** Nenhuma operação de escrita. Três testes de segurança dedicados aprovados. Opt-in temporário de execução da carga desativado depois do ensaio e comando retirado do pre-deploy normal. **Não equivale a teste de carga de checkout, webhook nem motor.**

**Regra de avanço:** uma evidência não fecha um gate além do seu escopo. Qualquer falha externa reproduzível cria pendência e bloqueia o go/no-go até correção comprovada.

## Complemento G6 — variantes de rota administrativa (07/11/2026 UTC)

- Revisão após segregação HTTP encontrou uma inconsistência entre o roteamento não estrito do Express e a comparação do gateway: `GET /staging/escritorio-admin/`, assim como assets administrativos com barra terminal, não eram classificados pelo mesmo predicado de proteção. Isso poderia expor HTML/JavaScript administrativo a visitante autenticado na prévia; **não foi demonstrada autorização para executar APIs administrativas ou movimentação financeira**, pois o backend exige operador por rota própria.
- A normalização do gateway agora remove barras finais **apenas na decisão de acesso**, mantendo URL encaminhada intacta. Regressão adversarial cobre seis variantes incluindo case/percent-encoding e exige zero encaminhamento ao backend com cookie do visitante, preservando acesso do operador.
- Commits na branch de integração: correção `07b52b07ead36c91b34a10109cb8a59cd04ed7f3`, regressão `a0def24d6550038171f04428d43b9b4c2f9fdf39`, gatilho de CI `d5a88a2d6ca5acd0e3e73f96bd2c49dc19d4636f`. **Validação CI e prova HTTPS do Railway ainda não confirmadas para esta revisão**. G6 permanece PARCIAL; sem deploy comercial ou admissão de pessoas reais.
