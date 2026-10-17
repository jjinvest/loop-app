# LOOP V6 — Extrato de créditos PREVISTOS no Escritório Vilela

Implementação em laboratório, sem autorização de pagamento real, criação de saldo sacável, garantias de recebimento ou aprovação jurídica.

## Concluído nesta etapa

- A tela Escritório Vilela (/escritorio-vilela) tem uma seção Meu extrato de contemplações — V6.
- A resposta autenticada GET /api/laboratorio/participante/minha-conta inclui creditosPrevistosV6, filtrado exclusivamente pela conta identificada pela sessão.
- A fonte são ciclos concluídos no motor da ponte de compras de laboratório, vinculados às posições do titular e ao valor de referência congelado na compra.
- Cada registro V6 exige seis IDs distintos de pedidos registrados como compras internas fictícias, com ordens e destinos conferidos. Destinos: 1, 3 e 5 centro; 2 e 6 investimento; 4 reserva.
- Para uma posição de R$ 250, o extrato mostra três parcelas previstas de R$ 250 (total R$ 750), mas disponivelParaSaqueCentavos, liquidadoCentavos e transferidoCentavos continuam em ZERO.
- Não há crédito ao cliente para bolas douradas, desistentes, adesões expiradas, sem centro concluído ou ciclos antigos migrados V5.
- Repetir uma consulta não cria crédito; nenhuma requisição do navegador pode forjar venda ou contemplação.
- Testes incluem duas contas, ausência de sessão, seis pedidos confirmados fictícios, falsificação de evento e saque bloqueado.

## Limitação: duas fontes distintas nesta versão

O Circuit Break de 300 giros usa 1.800 compradores ARTIFICIAIS com identificadores do tipo onda-0-pessoa-1. Ele continua SEPARADO da ponte de clientes registrados com contaId e comprovantes internos de laboratório. Esses compradores não correspondem às contas reais de teste cadastradas; não atribuir automaticamente suas contemplações.

A ponte de contas já permite compras validadas internamente, filas e tabuleiro. O novo extrato lê giros dessa ponte se existirem. Nesta etapa, os testes geram o giro da ponte internamente: ainda NÃO há acionamento unificado entre o Circuit Break e essa ponte. Esta unificação é o próximo trabalho de integração.

## Pendências anteriores a dinheiro real

1. Unificar controle de ritmo e motor da ponte usando os mesmos seis eventos confirmados.
2. Criar razão conciliado imutável de créditos, PSP autenticado, obrigações, disponibilidade de fundos e bloqueio de duplicidades.
3. Validar legalidade e sustentabilidade, relação com direitos do consumidor, LGPD e tratamento de estornos.
4. Permitir saque pelo próprio titular SOMENTE depois da conciliação e da validação jurídica, nunca com dinheiro de laboratório.

Branch fix/teste-escrita-catraca-20261014. PR #1 em rascunho. Não publicar nem mesclar sem autorização expressa.