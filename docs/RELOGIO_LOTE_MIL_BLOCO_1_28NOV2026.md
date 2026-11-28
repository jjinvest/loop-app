# Relógio e lote de mil — primeiro bloco — 28/11/2026

Pedido do proprietário: conectar relógio, luzes, contadores e catraca em blocos verificáveis. Somente ele executa START e a futura limpeza de dados. Preservar caixa central, filas, visual e históricos.

## Evidência do publicado antes da correção

Deployment 819cbe2c-9956-4f18-82fa-4ea6b7170c9c, revisão 319680cddb20ac0d67c7ae083202a98c0348c4ed. O inventário de inicialização registrou 1.000 posições (100 A e 900 B), caixa 25.000.000 centavos, zero eventos, zero giros, catracaAtiva=false e porteiraAberta=false. Esta observação é da inicialização, não uma consulta autenticada contínua. Nenhum START foi enviado.

## Causas encontradas e correções

1. O visor do lote contava para uma previsão mesmo com START desligado. O vencimento não autorizava execução, produzindo a aparência de relógio travado. Agora a pausa conserva meta e totais, mas mostra --:--. A contagem operacional aparece após autorização do proprietário.
2. Posições atualizava os quadros do lote sem renovar a agenda do visor. Posições e Tabuleiro passam a chamar registrarFluxoDistribuicao, usando eventosNoCiclo do motor, contadores e próxima luz retornados pelo servidor. O visor aplica o mesmo número persistido aos LEDs, sem acender luz por tempo transcorrido.

Não alterar o motor, cadência, regras 3A:1B, roteamento dos cofres, dados ou autorização. Salvar programação não executa START. Seis eventos concluem um centro; zerar o contador do ciclo no sexto evento não apaga o acumulado do dia.

## Testes e limites

Teste isolado da janela 08:00–10:00, 15 centros, 90 luzes, intervalo de 80 segundos: preparação sem START conserva zero; START somente na base em memória; cada marco registra um evento uma única vez; LEDs, eventos do dia e ciclos acompanham o livro; sexto evento conclui um centro e avança o próximo; caixa diminui em 6 × R$250; pausa bloqueia novos eventos. Testes existentes cobrem 90 eventos com reinício e mil eventos com conservação de caixa e bônus.

O teste público do lote será realizado pelo proprietário após a publicação conferida. Não declarar execução publicada de luzes/ciclos a partir dos testes isolados.

## Próximo bloco — Financeiro do titular

O lote atual usa identificadores de participantes próprios; não possui associação comprovada entre esses IDs e a conta real da Thaiza. Seus lançamentos ainda não são o livro financeiro real da conta. Implementar observação explícita e auditável por titular, com isolamento e retorno ao fluxo normal, sem copiar créditos para saques nem associar conta por suposição. Trabalho inicial de associação preservado localmente enquanto o bloco do relógio é concluído; não publicado.
