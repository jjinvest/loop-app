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
  // Cota dedicada: pagamentos antigos ja integrados devem ser revisitados,
  // mesmo durante uma chegada continua de novos pedidos ainda pendentes.
  listarRecebimentos:()=>{
   const corte=new Date(Date.parse(agora?agora():new Date().toISOString())-60000).toISOString();
   return banco.prepare(`SELECT pedido_id AS pedidoId FROM akitemm_sandbox_cobrancas
    WHERE status='RECEBIMENTO_INFORMADO_SANDBOX' AND atualizado_em<=?
    ORDER BY atualizado_em,pedido_id LIMIT 5`).all(corte).map(r=>r.pedidoId);
  }
 });
 const conferidorAvisos=caixaAvisos?new ConferidorAvisosAsaasSandboxSQLite({banco,caixaAvisos,cobrancas}):null;
 const callbacks=caixaAvisos?new ProcessadorCallbacksAsaasSandboxLab({banco,caixaAvisos,
  conferidor:conferidorAvisos,conciliador}):null;
 return Object.freeze({provedor:externo,cobrancas,comprovantes,elegibilidade,ponte:ponteIntegrada,
  catraca,conciliador,automatico,conferidorAvisos,callbacks});
}
module.exports={montarIntegracaoAsaasSandboxLoopLab};
