# LOOP 3.0 / AKITEMM — Confirmação de e-mail ligada ao gate de ativação

**04/11/2026 · Seção 203 · Apenas homologação local**

## Mudança efetiva
O cadastro e a confirmação de e-mail já possuíam persistência em `ContaUnicaCandidataSQLite`. O diagnóstico da seção 201 ainda não usava essa informação, embora fosse mostrada no perfil do Cliente. Essa lacuna agora foi fechada: o diagnóstico do pedido lê a **mesma conta e o mesmo SQLite** da loja, confere `titularId` com a pré-adesão e exige `emailVerificado===true` (prova concluída, não simples pedido de código).

Sem prova, o gate devolve `EMAIL_DA_CONTA_NAO_VERIFICADO` aos Escritórios Cliente e Administrador. Depois da confirmação autenticada com código (via transporte de ensaio), somente esse bloqueio desaparece. Os seis bloqueios definitivos de KYC, pagamento comercial, capacidade real 10/2, motor/financeiro e autorização continuam. Não há geração de posição, bônus, evento, giro ou pagamento real.

## Proteção e testes
- Fonte da conta deve compartilhar exatamente o SQLite do pedido; não aceita perfil inexistente, titular cruzado ou valor de verificação arbitrário.
- Mesmo na leitura administrativa (sem titular passado como filtro), a pré-adesão precisa trazer um `titularId` válido; respostas sem titular ou malformadas falham fechadas.
- Novo teste HTTP exercita conta real de ensaio, criação de pré-pedido, diagnóstico de Cliente/Admin, envio de código capturado por adaptador fictício, confirmação e nova leitura dos dois Escritórios; valida também bloqueio financeiro e integridade SQLite.
- Nenhum e-mail foi enviado pela Resend nesta prova: a integração de domínio e credencial externas permanece pendente. Validar o CI deste SHA separadamente.

**Marco Zero permanece bloqueado. PR #1 em DRAFT; sem merge, deploy de loja ou dinheiro real.**
