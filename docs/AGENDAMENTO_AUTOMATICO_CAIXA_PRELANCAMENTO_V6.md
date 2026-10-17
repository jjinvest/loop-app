# LOOP V6 — Programador de giros, Circuit Break e projeção de pré-lançamento

## O que o administrador controla no laboratório

O controle anterior tinha pausa/abertura, limite diário e lotes manuais 1, 3, 4, 5 ou 10. A novidade é o agendamento persistente de tentativas de giro usando datas, horários e quantidade. O agendador só atua enquanto o servidor LOCAL de laboratório está ligado. Não existe scheduler em produção ou provedor de pagamento real.

- Modo DISTRIBUIDO: até N giros ao longo da janela escolhida, incluindo 9h–18h. Por exemplo 20 slots, aproximadamente a cada 27 minutos, para tentar um giro por slot. Essas são oportunidades de giro, NÃO promessas de contemplação ou de pagamento.
- Modo PONTUAL: começa em um horário específico (agora ou daqui a 1 hora), executa no máximo um giro por minuto enquanto ainda estiver dentro da janela, mesmo que N seja maior que um.
- PAUSAR interrompe qualquer execução; ABRIR permite novamente apenas dentro das regras. Exceções, compras insuficientes, tabuleiro incompleto ou limite diário atingido deixam o slot pendente; fora do período programado nada é disparado em atraso.
- O intervalo automático é de 60 segundos, no servidor local; consultas do navegador nunca disparam pagamentos ou geram compras. O registro de cada slot tem comando estável idempotente. Se houver reinício entre o giro e a anotação do slot, o mesmo comando impede giro duplicado.
- O limite diário permanece compartilhado entre o cenário artificial de 300 giros e as compras fictícias cadastradas. A soma de novas agendas ativas de um dia não pode exceder o limite diário configurado ao salvar. Se o limite for alterado depois, prevalece o limite atual.
- Uma posição de empresa ou dourada no centro não equivale a um participante recebendo. Por isso o campo do agendador é número máximo de GIROS, e não número garantido de pessoas pagas.
- Cada giro continua exigindo seis compras fictícias distintas, verificadas no banco, com estado da fila e tabuleiro válido. Nenhum crédito previsto é convertido em disponível.

## Exemplo matemático: 100 compradores de PDFs

Se cada uma das 100 compras deixar exatamente R$ 225 LÍQUIDOS e TOTALMENTE LIVRES para estes três cofres (hipótese, não comprovante), a entrada é R$ 22.500. Sob divisão matemática 3:2:1: centro R$ 11.250; investimento R$ 7.500; reserva R$ 3.750.

Com referência nominal de R$ 250 por evento, 100 compras independentes permitiriam no máximo 16 giros de seis eventos (com 4 compras restantes), mas **16 giros requereriam R$ 24.000** nas três destinações. No exemplo de R$ 22.500, o teto MATEMÁTICO de caixa seria 15 giros, não 16; faltariam R$ 2.500 para preencher a referência nominal de todas as 100 compras. Isso não significa que 15 giros são financeiramente seguros ou juridicamente permitidos: custos, impostos, estornos e responsabilidades anteriores podem reduzir esse teto.

O painel agora oferece a projeção dessas grandezas sem permitir que o usuário informe saldo sacável ou transforme a previsão em crédito. O controle agendado continua exclusivamente fictício, com saldos bancários REAIS de R$ 0 e saques reais desabilitados.

## Ainda não implementado

- Não existem depósitos reais reconciliados nos três cofres nem conexão PSP licenciada que execute PIX. O agendador só gira o motor fictício; ele NÃO efetua o saque/repasse ao participante.
- Antes de pagamentos será preciso demonstrar liquidez REAL por cofre, reservas e obrigações presentes e futuras; bloquear liberação financeira se caixa do centro estiver insuficiente; conciliar estornos e saldos reais; e obter análise jurídica e de sustentabilidade independente do modelo de remuneração por compras e indicações.
- O número de pessoas que recebe benefício não pode ser imposto pelo calendário: o calendário é teto de tentativas e depende de seis compras verdadeiramente qualificadas e de titular elegível no centro. A programação não deve ser apresentada ao consumidor como garantia de retorno.

Registros: tabela loop_v6_agendas_demo, tabela loop_v6_agenda_slots_demo e histórico imutável loop_v6_agenda_execucoes_demo. Rotas apenas na aplicação de laboratório local com chave de administrador. Nenhuma alteração foi publicada/mesclada em produção.