# LOOP 3.0 / AKITEMM — Aceite individual das posições em homologação (05/11/2026)

## Etapa concluída no código
1. Os pagamentos de **ensaio** são vinculados ao lote do motor apenas após reconsulta independente do Asaas Sandbox (GET PSP RECEIVED, vínculo titular/pedido/valor/registro validado). A criação inicial continua **azul/pendente**.
2. O painel **Minhas Posições** existente mostra, em cada posição pendente, CPF da conta mascarado (apenas dois dígitos finais), checkbox **individual** e botão de aceite. A área de identidade da conta continua responsável pelo CPF; não o redigitar ou duplicar armazenamento.
3. O endpoint `POST /staging/motor/posicoes/confirmar-ensaio` exige sessão do titular + CSRF, objeto estrito `{aceiteExplicito:true,posicaoId,versaoTermos}` e confirma unicamente a posição daquele titular. Nenhum campo CPF via HTTP no aceite.
4. A transação SQLite `BEGIN IMMEDIATE` confere: posição pertencente ao titular/mesmo pedido, PSP reconsultado ainda RECEIVED, sem revisão/reversão, CPF de laboratório já vinculado ao titular, hash da versão de termos correta e aceite explícito. Só então persiste o registro **imutável** em `akitemm_motor_ensaio_aceites_posicao` (CPF HMAC, hash termos, versão, data, ID da posição), e muda apenas o estado simulado da posição de `PENDENTE` para `ACEITE_ENSAIO`.
5. Uma posição de ensaio com aceite passa a ser sinalizada em **verde nas telas LOOP**; as demais permanecem azuis. Isso NÃO tem relação com as quatro cores da **loja AKITEMM**. O aceite no ensaio **não é verificação de identidade externa**, não habilita financeiro, não confirma KYC e não cria direitos comerciais.
6. Repetir o mesmo aceite não duplica registros; outra conta recebe 404; falta CPF, termos, pagamento conciliado ou presença de reversão bloqueia. Estorno confirmado pelo PSP deixa lote em revisão e impede novos aceites, mas preserva registros históricos.
7. As telas e abas aprovadas foram preservadas; o único acréscimo visual é o controle individual dentro dos cartões de **Minhas Posições** e o sinal verde do estado aceito.

## Evidências e limites
- CI completo e navegador PC/celular [42083739043](https://github.com/jjinvest/loop-app/actions/runs/42083739043): **SUCCESS**, testando fluxo HTTP do pedido ROXO configurado com cinco posições, PSP, CPF fictício por titular, confirmação individual de uma posição, replay, CSRF, isolamento e reversão; além da suíte geral.
- Código validado na branch `feature/unificar-escritorio-real-20261105`, SHA `5ea24331925f32039f2b1afabd963158981d3659`.
- **Nenhum pagamento real**, caixa, bônus, saque ou posição comercial liberados; sem merge, sem alteração da PR #1 DRAFT. A aplicação candidata bloqueia `NODE_ENV=production`.
- Infraestrutura de CPF só funciona quando a custódia de laboratório está configurada (duas chaves separadas). A prévia solicita **CPF fictício**; nunca usar CPF de pessoa real nos ensaios.
- O último BLOQUEIO de Marco Zero não é apenas implementação: faltam pagamentos comerciais seguros, KYC e termos definitivos adequados, controles financeiros com prova de solvência, política de fornecedores/frete e revisão jurídica/regulatória do modelo de benefícios por entradas.
