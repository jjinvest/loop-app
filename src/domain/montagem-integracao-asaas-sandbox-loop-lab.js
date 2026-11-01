'use strict';
// Montagem exclusivamente local. Nao expor em HTTP ou producao.
const {AsaasSandboxLojaV6}=require('./asaas-sandbox-loja-v6');
const {CobrancasAkitemmAsaasSandboxSQLite}=require('./cobrancas-akitemm-asaas-sandbox-v6');
const {ComprovanteAsaasSandboxPonteLab}=require('./comprovante-asaas-sandbox-ponte-lab');
const {PonteElegibilidadeAsaasTitularidadeLab}=require('./ponte-elegibilidade-asaas-titularidade-lab');
const {PonteComprasConvitesDemoSQLite}=require('./ponte-compras-convites-demo-sqlite');
const {CatracaAsaasSandboxLab}=require('./catraca-asaas-sandbox-lab');
const {ConciliadorPosicaoAsaasSandboxLab}=require('./conciliador-posicao-asaas-sandbox-lab');
const {ConciliacaoAutomaticaAsaasSandboxLab}=require('./conciliacao-automatica-asaas-sandbox-lab');
const {ConferidorAvisosAsaasSandboxSQLite}=require('./conferidor-avisos-asaas-sandbox-sqlite');
const {ProcessadorCallbacksAsaasSandboxLab}=require('./processador-callbacks-asaas-sandbox-lab');
function montarIntegracaoAsaasSandboxLoopLab({banco,contas,titularidade,apiKey,fetchImpl,provedor,agora,ponte=null,caixaAvisos=null}={}){
 if(!banco||!contas||contas.banco!==banco||
    !titularidade||titularidade.banco!==banco||
    typeof titularidade.conferir!=='function')
  throw new TypeError('SQLite, contas e pedidos identificados do mesmo laboratorio obrigatorios');
 const externo=provedor||new AsaasSandboxLojaV6({apiKey,fetchImpl});
 if(!(externo instanceof AsaasSandboxLojaV6)||externo.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO')
  throw new TypeError('Somente provedor Asaas Sandbox permitido');
 const cobrancas=new CobrancasAkitemmAsaasSandboxSQLite({banco,provedor:externo,...(agora?{agora}:{})});
 const comprovantes=new ComprovanteAsaasSandboxPonteLab({cobrancas,titularidade});
 const elegibilidade=new PonteElegibilidadeAsaasTitularidadeLab({cobrancas,titularidade});
 if(ponte&&(ponte.banco!==banco||ponte.contas!==contas||
    ponte.pedidosIdentificados!==titularidade||
    ponte.atribuicaoManualPorPosicao!==true))
  throw new TypeError('Ponte compartilhada deve usar o mesmo banco, titularidade e adesao individual');
 // Ponte externa pode consultar PSP ficticio: proibido compartilhar ate validar a fonte.
 if(ponte)ponte.configurarFonteAsaasSandbox(comprovantes);
 const ponteIntegrada=ponte||new PonteComprasConvitesDemoSQLite({
  banco,contas,pedidosIdentificados:titularidade,
  consultarPagamentoConfiavel:pedidoId=>comprovantes.consultar(pedidoId),
  atribuicaoManualPorPosicao:true
 });
 const catraca=new CatracaAsaasSandboxLab({elegibilidade,ponte:ponteIntegrada});
 const conciliador=new ConciliadorPosicaoAsaasSandboxLab({cobrancas,catraca});
 // Descoberta por pagina de chave primaria: nao copiar milhares de pedidos
 // em memoria nem refazer a varredura completa a cada pulso do agendador.
 // Cursor e apenas otimizacao local; apos reinicio, a busca recomeca no SQLite.
 let ultimoPedidoExaminado='';
 const consultarPendentes=banco.prepare(`SELECT c.pedido_id AS pedidoId
   FROM akitemm_sandbox_cobrancas c
   WHERE c.pedido_id>? AND c.status <> 'REVERSAO_INFORMADA_SANDBOX'
   AND NOT EXISTS(SELECT 1 FROM admin_ponte_compras_demo p WHERE p.pedido_id=c.pedido_id)
   AND NOT EXISTS(SELECT 1 FROM admin_ponte_vendas_loja_sem_loop_demo p WHERE p.pedido_id=c.pedido_id)
   AND NOT EXISTS(SELECT 1 FROM admin_ponte_vendas_loja_apos_reajuste_demo p WHERE p.pedido_id=c.pedido_id)
   ORDER BY c.pedido_id LIMIT ?`);
 const automatico=new ConciliacaoAutomaticaAsaasSandboxLab({conciliador,
  listarPendentes:()=>{
   const limiteDescoberta=20;
   let linhas=consultarPendentes.all(ultimoPedidoExaminado,limiteDescoberta);
   if(linhas.length===0&&ultimoPedidoExaminado)
    linhas=consultarPendentes.all('',limiteDescoberta);
   const pendentes=linhas.map(r=>r.pedidoId);
   if(linhas.length>0)ultimoPedidoExaminado=linhas[linhas.length-1].pedidoId;
   if(linhas.length<limiteDescoberta)ultimoPedidoExaminado='';
   return pendentes;
  },
  // Cota dedicada e cursor circular para recebimentos antigos:
  // cinco cobrancas que repetidamente falham na API nao podem impedir
  // revisao de estornos das demais. Cursor nao altera o livro financeiro.
  listarRecebimentos:(()=>{
   let cursor=null;
   const pagina=banco.prepare(`SELECT pedido_id AS pedidoId,
     atualizado_em AS atualizadoEm FROM akitemm_sandbox_cobrancas
    WHERE status='RECEBIMENTO_INFORMADO_SANDBOX' AND atualizado_em<=?
      AND (atualizado_em>? OR (atualizado_em=? AND pedido_id>?))
    ORDER BY atualizado_em,pedido_id LIMIT 5`);
   const inicio=banco.prepare(`SELECT pedido_id AS pedidoId,
     atualizado_em AS atualizadoEm FROM akitemm_sandbox_cobrancas
    WHERE status='RECEBIMENTO_INFORMADO_SANDBOX' AND atualizado_em<=?
    ORDER BY atualizado_em,pedido_id LIMIT 5`);
   return ()=>{
    const corte=new Date(Date.parse(agora?agora():new Date().toISOString())-60000).toISOString();
    let linhas=cursor?pagina.all(corte,cursor.atualizadoEm,
      cursor.atualizadoEm,cursor.pedidoId):inicio.all(corte);
    if(linhas.length===0&&cursor)linhas=inicio.all(corte);
    cursor=linhas.length===5?linhas[linhas.length-1]:null;
    return linhas.map(r=>r.pedidoId);
   };
  })()
 });
 // Comparacao independente, EXCLUSIVAMENTE LEITURA, entre cobrancas,
 // titularidade e os tres livros de pedidos da ponte. Nao decide saques
 // nem altera posicoes; reversoes exigem revisao, nunca exclusao automatica.
 function resumoConvergencia(){
  const dados=banco.prepare(`SELECT
   COUNT(*) AS cobrancas,
   COALESCE(SUM(CASE WHEN c.status='RECEBIMENTO_INFORMADO_SANDBOX' THEN 1 ELSE 0 END),0) AS recebimentosInformados,
   COALESCE(SUM(CASE WHEN c.status='REVERSAO_INFORMADA_SANDBOX' THEN 1 ELSE 0 END),0) AS reversoesInformadas,
   COALESCE(SUM(CASE WHEN c.status='PENDENTE_SANDBOX' THEN 1 ELSE 0 END),0) AS pendentes,
   COALESCE(SUM(CASE WHEN c.status='CRIACAO_INDETERMINADA_SANDBOX' THEN 1 ELSE 0 END),0) AS criacoesIndeterminadas,
   COALESCE(SUM(CASE WHEN c.status NOT IN
    ('RECEBIMENTO_INFORMADO_SANDBOX','REVERSAO_INFORMADA_SANDBOX',
     'PENDENTE_SANDBOX','CRIACAO_INDETERMINADA_SANDBOX')
    THEN 1 ELSE 0 END),0) AS estadosAsaasDesconhecidos,
   COALESCE(SUM(CASE WHEN p.pedido_id IS NOT NULL THEN 1 ELSE 0 END),0) AS pedidosComPosicao,
   COALESCE(SUM(CASE WHEN s.pedido_id IS NOT NULL OR r.pedido_id IS NOT NULL THEN 1 ELSE 0 END),0) AS pedidosSomenteLoja,
   COALESCE(SUM(CASE WHEN t.pedido_id IS NULL THEN 1 ELSE 0 END),0) AS semTitularidade,
   COALESCE(SUM(CASE WHEN t.pedido_id IS NOT NULL AND t.valor_centavos<>c.valor_centavos
     OR p.pedido_id IS NOT NULL AND p.valor_centavos<>c.valor_centavos
     OR s.pedido_id IS NOT NULL AND s.valor_centavos<>c.valor_centavos
     OR r.pedido_id IS NOT NULL AND r.valor_centavos<>c.valor_centavos
    THEN 1 ELSE 0 END),0) AS valoresDivergentes,
   COALESCE(SUM(CASE WHEN t.pedido_id IS NOT NULL AND (
       p.pedido_id IS NOT NULL AND p.conta_id<>t.conta_id
       OR s.pedido_id IS NOT NULL AND s.conta_id<>t.conta_id
       OR r.pedido_id IS NOT NULL AND r.conta_id<>t.conta_id)
    THEN 1 ELSE 0 END),0) AS titularesDivergentes,
   COALESCE(SUM(CASE WHEN (CASE WHEN p.pedido_id IS NULL THEN 0 ELSE 1 END+
     CASE WHEN s.pedido_id IS NULL THEN 0 ELSE 1 END+
     CASE WHEN r.pedido_id IS NULL THEN 0 ELSE 1 END)>1
    THEN 1 ELSE 0 END),0) AS multiplosLivros,
   COALESCE(SUM(CASE WHEN c.status='RECEBIMENTO_INFORMADO_SANDBOX'
    AND p.pedido_id IS NULL AND s.pedido_id IS NULL AND r.pedido_id IS NULL
    THEN 1 ELSE 0 END),0) AS recebidosAguardandoPonte,
   COALESCE(SUM(CASE WHEN c.status='REVERSAO_INFORMADA_SANDBOX'
    AND p.pedido_id IS NOT NULL THEN 1 ELSE 0 END),0) AS reversoesComPosicaoPreservada,
   COALESCE(SUM(CASE WHEN c.status NOT IN ('RECEBIMENTO_INFORMADO_SANDBOX','REVERSAO_INFORMADA_SANDBOX')
    AND (p.pedido_id IS NOT NULL OR s.pedido_id IS NOT NULL OR r.pedido_id IS NOT NULL)
    THEN 1 ELSE 0 END),0) AS integracoesSemRecebimento
   FROM akitemm_sandbox_cobrancas c
   LEFT JOIN admin_pedidos_titularidade_demo t ON t.pedido_id=c.pedido_id
   LEFT JOIN admin_ponte_compras_demo p ON p.pedido_id=c.pedido_id
   LEFT JOIN admin_ponte_vendas_loja_sem_loop_demo s ON s.pedido_id=c.pedido_id
   LEFT JOIN admin_ponte_vendas_loja_apos_reajuste_demo r ON r.pedido_id=c.pedido_id`).get();
  const adicionais=banco.prepare(`SELECT COUNT(*) AS quantidade
   FROM admin_ponte_posicoes_adicionais_demo x
   JOIN akitemm_sandbox_cobrancas c ON c.pedido_id=x.pedido_id`).get().quantidade;
  // Posicoes extras possuem UNIQUE em sua propria tabela, mas nao ha
  // UNIQUE cruzado com a cadeira primaria de OUTROS pedidos (ou do mesmo).
  // Um ID reutilizado significa duas atribuicoes logicas para uma cadeira.
  const idReutilizadoEmPosicaoAdicional=banco.prepare(`SELECT COUNT(*) AS quantidade
   FROM admin_ponte_posicoes_adicionais_demo x
   JOIN akitemm_sandbox_cobrancas c ON c.pedido_id=x.pedido_id
   WHERE EXISTS(SELECT 1 FROM admin_ponte_compras_demo p
    WHERE p.posicao_id=x.posicao_id)`).get().quantidade;
  // Consolidar alertas do worker de callbacks no mesmo monitor da loja.
  // O worker devolve contadores persistidos; nenhum job e reservado,
  // nenhum token, CPF ou ID de cliente e exposto por este endpoint.
  const filaCallbacks=callbacks?.resumo()||null;
  const callbacksExigemRevisao=filaCallbacks?.estados
   ?.find(x=>x.estado==='EXIGE_REVISAO')?.quantidade||0;
  const callbacksConcluidos=filaCallbacks?.estados
   ?.find(x=>x.estado==='CONCLUIDO')?.quantidade||0;
  const callbacksPendentesProntos=filaCallbacks?.pendentesProntos||0;
  const callbacksLeasesExpirados=filaCallbacks?.leasesExpirados||0;
  const callbacksSemJob=filaCallbacks?.avisosSemJob||0;
  // Uma cobranca local continua RECEBIDA quando uma reconsulta posterior
  // retorna PENDING/CONFIRMED ou estado futuro (historico imutavel), mas
  // isso NAO equivale a ultima confirmacao remota. Exigir revisao humana.
  // Somente PIX com status RECEIVED comprova este tipo de recebimento; o
  // recebimento manual em dinheiro nao credita saldo na conta Asaas.
  const reconsultasSemRecebimento=banco.prepare(`SELECT COUNT(*) AS n
   FROM akitemm_sandbox_cobrancas c
   WHERE c.status='RECEBIMENTO_INFORMADO_SANDBOX'
    AND COALESCE((SELECT h.status_asaas
      FROM akitemm_sandbox_consultas h WHERE h.pedido_id=c.pedido_id
      ORDER BY h.id DESC LIMIT 1),'')<>'RECEIVED'`).get().n;
  // Sentinela de legado: uma unica compra NAO pode ter cobranca Asaas
  // e evento de confirmacao/estorno do simulador. Somente leitura; nao
  // exclui o evento, nao mexe em titularidade e nao cancela posicoes.
  const tabelasPagamentoFicticio=['admin_carrinho_loop_eventos_demo',
   'admin_pdf_demo_eventos'].filter(t=>banco.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t));
  const origemDupla=tabelasPagamentoFicticio.map(t=>
   'EXISTS(SELECT 1 FROM '+t+' e WHERE e.pedido_id=c.pedido_id)').join(' OR ');
  const fontesPagamentoDuplicadas=origemDupla?banco.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_sandbox_cobrancas c WHERE '+origemDupla
  ).get().n:0;
  const anomalias=dados.semTitularidade+dados.valoresDivergentes+
   dados.titularesDivergentes+dados.multiplosLivros+
   dados.integracoesSemRecebimento+idReutilizadoEmPosicaoAdicional+
   callbacksExigemRevisao+dados.estadosAsaasDesconhecidos+
   reconsultasSemRecebimento+fontesPagamentoDuplicadas;
  return Object.freeze({ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
   modo:'CONVERGENCIA_SQLITE_SOMENTE_LEITURA',...dados,
   posicoesAdicionais:adicionais,
   idReutilizadoEmPosicaoAdicional,reconsultasSemRecebimento,
   fontesPagamentoDuplicadas,
   callbacksExigemRevisao,callbacksConcluidos,callbacksPendentesProntos,
   callbacksLeasesExpirados,callbacksSemJob,
   callbacksHabilitados:Boolean(filaCallbacks),
   anomaliasContadasPorCriterio:anomalias,
   // Criacao indeterminada nao pode disparar outro POST automaticamente.
   // Recebido sem ponte, reversoes e callbacks esgotados exigem revisao.
   // Retries prontos e leases expirados sao recuperaveis pelo worker.
   revisaoManualIndicada:anomalias>0||dados.criacoesIndeterminadas>0||
    dados.recebidosAguardandoPonte>0||dados.reversoesInformadas>0,
   pagamentosReais:false,caixaBancarioConciliado:false,
   posicoesAlteradas:0,saquesLiberados:0,somenteLeitura:true});
 }
 const conferidorAvisos=caixaAvisos?new ConferidorAvisosAsaasSandboxSQLite({banco,caixaAvisos,cobrancas}):null;
 const callbacks=caixaAvisos?new ProcessadorCallbacksAsaasSandboxLab({banco,caixaAvisos,
  conferidor:conferidorAvisos,conciliador}):null;
 return Object.freeze({provedor:externo,cobrancas,comprovantes,elegibilidade,ponte:ponteIntegrada,
  catraca,conciliador,automatico,conferidorAvisos,callbacks,resumoConvergencia});
}
module.exports={montarIntegracaoAsaasSandboxLoopLab};
