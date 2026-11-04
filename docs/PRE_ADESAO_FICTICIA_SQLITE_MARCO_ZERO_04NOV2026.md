# LOOP 3.0 / AKITEMM — Pré-adesão fictícia persistida e monitoramento de filas

**04/11/2026 · Seção 199.** Escopo exclusivo do **candidato local de homologação**, sem vendas, posições, saques, bônus ou giros reais. PR #1 continua DRAFT, sem merge nem deploy.

## Entregue no mesmo SQLite
- Novo módulo `src/domain/pre-adesao-sandbox-candidato-sqlite.js`: checkpoint **PRE_ADESAO_FICTICIA_NAO_ATIVADA**, único por pré-pedido e por posição fictícia do Asaas Sandbox. O registro usa FK para pré-pedido e posição fictícia, transação `BEGIN IMMEDIATE` e triggers que recusam alteração/exclusão de histórico. A repetição da mesma solicitação retorna o mesmo registro; concorrência e unicidade são garantidas por SQLite.
- Antes de registrar, revalida **pagamento fictício reconsultado independentemente no PSP** (status `RECEIVED` sem revisão/reversão), titular/valor exatos de R$ 250, presença de uma posição pendente histórica no Sandbox e fotografia imutável da oferta do pré-pedido: VERDE com mínimo cumprido e valor de R$ 250, sem evento especial pendente.
- Exige existência de **CPF fictício de ensaio e aceite expresso dos termos de laboratório já registrados** na custódia criptografada da mesma conta e versão de termos vigente. Isso **não é validação externa de CPF** nem confere a identidade civil de ninguém.
- A trilha grava hash SHA-256 da fotografia original e do texto dos termos, versão e horário, mas não persiste CPF em claro na pré-adesão. A consulta posterior reavalia a situação atual do pagamento. Se o Sandbox indicar reversão ou inconsistência, o registro histórico é preservado, passando a **ENSAIO_HISTORICO_EM_REVISAO**.
- A pré-adesão é visível no painel da Fila B do administrador e na prévia do cliente como **checkpoint fictício persistido**, não como posição ativada. A ligação com o `MotorFilas` continua apenas uma projeção em memória, sem giro nem lançamento real.

## Controles operacionais
- Administrador: campos de ID do pré-pedido, **Conferir requisitos** e **Registrar pré-adesão fictícia**. Endpoints `GET /staging/escritorio-unificado/pre-adesao/:id` e `POST /staging/escritorio-unificado/preparar-pre-adesao` exigem segredo de operador e a chave operacional `operacoesSandboxAutorizadas=true`. Sem PSP/custódia de CPF a ação falha fechada. Campos extras que poderiam conceder permissões são recusados.
- Escritório do Cliente: `GET /staging/minhas-pre-adesoes` usa cookie de sessão do titular e mostra exclusivamente seus registros, com motivos de revisão e **posição real = 0**. Não permite escrever nem escolher titular de outra conta.
- Nenhuma operação de leitura consulta PSP externamente. POST só grava o checkpoint, não o resultado de um pagamento, nem ativa posições reais. Não há uso de fila persistida produtiva, tabuleiro, catraca, cofre, lucro, bônus, saque ou credencial comercial.

## Validação e próximos bloqueios
Os testes automatizados cobrem ausência de CPF/termos, sessão e operador, PSP Sandbox, bloqueio por request indevida, idempotência, reversão, isolamento entre titulares, gatilho de imutabilidade e backup/reabertura do SQLite. Testes de navegador PC/celular verificam o formulário do administrador e a área do cliente.

O **motor real** permanece bloqueado: somente após homologação externa de identidade e pagamento, regras jurídicas da oferta e eventos, antifraude, infraestrutura, backups, conciliação, auditorias e autorização explícita de produção poderá existir uma transição de adesão válida. Não confundir este checkpoint com inscrição no tabuleiro.

Aguardar a conclusão dos workflows de CI do SHA final antes de declarar sucesso.
