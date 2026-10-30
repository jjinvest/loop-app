# LOOP 3.0 — Decisão vigente: taxa de saque do participante = 0%

**Decisão expressamente aprovada pelo idealizador em 21/10/2026.** Registro de mudança de política, sem apagar relatórios históricos de 3%, e execução somente no laboratório.

## Regra comercial vigente
- O participante solicita um valor e **não sofre qualquer desconto por taxa de saque**: percentual **0%**, tarifa ao participante **R$0** e valor líquido indicado **igual ao valor solicitado**, sujeito à existência de saldo realmente verificado quando houver operação de produção.
- A empresa decide **assumir eventuais tarifas do banco/provedor de pagamento**, como despesa própria. Valor, base de cálculo, incidência, prestador, política de repasses e disponibilidade do serviço são **a confirmar** com instituição financeira ou PSP. **Não** inventar despesa de R$0 como se a tarifa bancária já tivesse sido negociada.
- Permanecem os demais bloqueios e proteções vigentes: mínimo de R$25 para solicitações de bônus, CPF e termos para habilitação conforme regras, saldo bonificado autorizado, idempotência, privacidade, prazo de análise de até 24 horas corridas no laboratório e inexistência de saques bancários reais. Não antecipar distribuição, liquidação ou promessa de lucro.
- Os cálculos históricos das simulações de receita e cofres **não comprovam lucro real ou viabilidade final**; eventual custo empresarial deve entrar em conciliação futura de despesas sem tirar do participante.
- Nova política não reescreve solicitações já registradas: **lançamentos históricos de 3% continuam com os valores originais** e aparecem com sua taxa histórica correta. Novas solicitações são 0%. Essa distinção protege a trilha de auditoria. Não houve reembolso bancário nem é aplicado estorno automático de histórico fictício.

## Código modificado, sem redesenho

- `src/domain/indicacoes-links-comissoes-demo-sqlite.js`: `simularElegibilidadeSaque` retorna `taxaPercentual:0`, `taxaSaqueCentavos:0` e `valorLiquidoCentavos=valorSolicitadoCentavos` tanto para bônus quanto na simulação matemática de participação em lucro. A participação em lucro continua indisponível para saque efetivo sem livro próprio validado.
- `src/domain/solicitacoes-saque-demo-sqlite.js`: `TAXA_SAQUE_PERCENTUAL=0`; nova tabela com `CHECK(taxa_percentual IN (0,3))` para aceitar 0% atual e ler o legado de 3%, e `CHECK(taxa_percentual<>0 OR taxa_centavos=0)` para impedir taxa de centavos oculta nos lançamentos de 0%. Migração transacional preserva todos os registros antigos e reconstrói índices e triggers anti-UPDATE/DELETE; verificada também após reinício.
- `src/laboratorio/participante-demo.html` e `.js`: alteração **somente de textos relacionados à tarifa**, sem mudança de desenho/tela; histórico apresenta percentual gravado por solicitação (0% atual, 3% legados), em vez de declarar 3% para todas.
- Regressões previamente existentes ajustadas para valores de taxa zero; teste novo `test/saques-taxa-zero-migracao-historico.test.js` cria um banco com o `CHECK` de 3% e lançamento anterior de R$25, taxa 75 centavos/líquido 2.425 centavos. Depois da migração, o registro antigo se mantém igual e um novo pedido de R$25 tem taxa **zero** e líquido integral de 2.500 centavos. Reabertura, unicidade, idempotência, integridade SQL, integridade de chaves e triggers de imutabilidade verificados.

## Resultado comprovado de CI
- [GitHub Actions — Testes do LOOP, execução 39674783321](https://github.com/jjinvest/loop-app/actions/runs/39674783321): **SUCCESS, 473 de 473 testes aprovados; 0 falhas**.
- `LOOP_TAXA_ZERO_MIGRACAO`: taxa atual 0%, taxa histórica 3% preservada, nova solicitação R$25 com tarifa R$0 e líquido R$25, dois registros, comissão de teste R$50, reserva fictícia R$450, `integrity_check=ok`.
- `LOOP_WAL_FINANCEIRO`: três saques simulados de R$25 cada sem retenção; taxa total R$0, líquido R$75, reserva de teste livre R$425 com R$75 de bônus já comprometido, sem débito duplo.
- `LOOP_SQLITE_FINANCEIRO` e `LOOP_SAQUE_ROLLBACK` também registram taxa zero, preservando as travas de idempotência e recuperação.
- Testes de navegador do mesmo commit são uma verificação independente; seu status deve ser consultado no Actions antes de afirmar aprovação (não inferir do teste unitário).

## Limites e continuidade
Laboratório isolado, sem PSP, banco, dinheiro real ou CPF verdadeiro, e sem ativação de pagamento real. **Não** alterar a hierarquia das filas A/B, regras dos seis eventos, saldo reservado, cabimento de saques, promoções ou telas aprovadas. PR #1 continua em rascunho, sem merge, publicação, deploy ou alterações em `main`.

Os relatórios anteriores que mencionam 3% registram corretamente a **política histórica que foi testada naquele momento**; devem permanecer disponíveis com este documento como referência de decisão atual.