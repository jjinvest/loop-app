# LOOP V6 — Programador de giros, Circuit Break e projeção de pré-lançamento

## O que o administrador controla no laboratório

O controle anterior tinha pausa/abertura, limite diário e lotes manuais 1, 3, 4, 5 ou 10. A novidade é o agendamento persistente de tentativas de giro usando datas, horários e quantidade. O agendador só atua enquanto o servidor LOCAL de laboratório está ligado. Não existe scheduler em produção ou provedor de pagamento real.

- Modo DISTRIBUIDO: até N giros ao longo da janela escolhida, incluindo 9h–18h. Por exemplo 20 slots, aproximadamente a cada 27 minutos, para tentar um giro por slot. Essas são oportunidades de giro, NÃO promessas de contemplação ou de pagamento.
- Modo PONTUAL: começa em um horário específico (agora ou daqui a 1 hora), executa no máximo um giro por minuto enquanto ainda estiver dentro da janela, mesmo que N seja maior que um.
- PAUSAR interrompe qualquer execução; ABRIR permite novamente apenas dentro das regras. Exceções, compras insuficientes, tabuleiro incompleto ou limite diário atingido deixam o slot pendente; fora do período programado nada é disparado em atraso.
- O intervalo automático é de 60 segundos, no servidor local; consultas do navegador nunca disparam pagamentos ou geram compras. O registro de cada slot tem comando estável idempotente. Se houver reinício entre o giro e a anotação do slot, o mesmo comando impede giro duplicado.
- O limite diário permanece compartilhado entre o cenário artificial de 300 giros e as compras fictícias cadastradas. A soma de novas agendas ativas de um dia não pode exceder o limite diário configurado ao salvar. Se o limite for alterado depois, prevalece o limite atual.
- Uma posição de empresa ou dourada no centro não equivale a um participante recebendo; seu destino é o quarto cofre. Por isso o campo do agendador é número máximo de GIROS, nunca número de pessoas pagas.
- Cada giro continua exigindo seis compras fictícias distintas, verificadas no banco, com estado da fila e tabuleiro válido. Nenhum crédito previsto é convertido em disponível.

## Lançamentos distintos: loja, LOOP e Cofre Dourado

Vender um produto ou PDF NÃO significa receber R$ 250 para o LOOP. A loja mantém sua receita, fornecedores, taxas, impostos e margens comerciais em controles próprios. O motor de filas pode registrar a posição originada de uma compra qualificada, mas o demonstrativo dos cofres só é alimentado por um aporte separado de R$ 250, identificado no laboratório e que ainda não é recebimento bancário comprovado.

**Exemplo:** 100 vendas de PDF com R$ 225 líquidos comerciais = R$ 22.500 na simulação da LOJA; zero nos cofres do LOOP se não existirem aportes separados. No cenário independente de 100 aportes fictícios de R$ 250, seriam R$ 25.000 de referência para o LOOP, divididos em R$ 12.500 para o centro, aproximadamente R$ 8.333,33 para investimento e R$ 4.166,67 para reserva (com arredondamento de centavos). Esses montantes não se somam à receita comercial sem verificação da origem, não provam caixa bancário e não autorizam pagamentos.

Os cofres do LOOP são **CENTRO, ESQUERDA, DIREITA e DOURADAS**. O Dourado não participa da arrecadação inicial dos três principais: quando uma posição dourada conclui seu ciclo, as parcelas 1, 3 e 5 são separadas do centro para o quarto cofre. Se o centro é de participante ativo, os mesmos eventos geram apenas previsão no escritório correspondente. O movimento da fila e o número de giros são iguais nos dois casos.

Um giro ocorre depois de seis eventos internos distintos de compra. A catraca não tem modo alternativo de 'contar pessoas': a identidade da posição altera exclusivamente o destino contábil. A escolha manual ou programada é sempre uma quantidade de GIROS. Nenhum desses registros é dinheiro sacável ou Pix real.

## Limites do cenário

## Ainda não implementado

- Não existem depósitos reais reconciliados nos quatro cofres nem conexão PSP licenciada que execute PIX. O agendador só gira o motor fictício; ele NÃO efetua o saque/repasse ao participante.
- Antes de pagamentos será preciso demonstrar liquidez REAL por cofre, reservas e obrigações presentes e futuras; bloquear liberação financeira se caixa do centro estiver insuficiente; conciliar estornos e saldos reais; e obter análise jurídica e de sustentabilidade independente do modelo de remuneração por compras e indicações.
- O número de pessoas que recebe benefício não pode ser imposto pelo calendário: o calendário é teto de tentativas e depende de seis compras verdadeiramente qualificadas e de titular elegível no centro. A programação não deve ser apresentada ao consumidor como garantia de retorno.

Registros: tabela loop_v6_agendas_demo, tabela loop_v6_agenda_slots_demo e histórico imutável loop_v6_agenda_execucoes_demo. Rotas apenas na aplicação de laboratório local com chave de administrador. Nenhuma alteração foi publicada/mesclada em produção.