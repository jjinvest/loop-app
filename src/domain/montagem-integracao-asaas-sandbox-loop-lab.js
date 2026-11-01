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
function montarIntegracaoAsaasSandboxLoopLab({banco,contas,titularidade,apiKey,fetchImpl,provedor,agora,ponte=null}={}){
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
 if(ponte)throw new TypeError('Ponte externa requer comprovante Asaas verificado; compartilhamento bloqueado');
 const ponteIntegrada=new PonteComprasConvitesDemoSQLite({
  banco,contas,pedidosIdentificados:titularidade,
  consultarPagamentoConfiavel:pedidoId=>comprovantes.consultar(pedidoId),
  atribuicaoManualPorPosicao:true
 });
 const catraca=new CatracaAsaasSandboxLab({elegibilidade,ponte:ponteIntegrada});
 const conciliador=new ConciliadorPosicaoAsaasSandboxLab({cobrancas,catraca});
 const automatico=new ConciliacaoAutomaticaAsaasSandboxLab({conciliador,
  listarPendentes:()=>banco.prepare(`SELECT c.pedido_id AS pedidoId
   FROM akitemm_sandbox_cobrancas c
   WHERE c.status <> 'REVERSAO_INFORMADA_SANDBOX'
   AND NOT EXISTS(SELECT 1 FROM admin_ponte_compras_demo p WHERE p.pedido_id=c.pedido_id)`)
   .all().map(r=>r.pedidoId)
 });
 return Object.freeze({provedor:externo,cobrancas,comprovantes,elegibilidade,ponte:ponteIntegrada,catraca,conciliador,automatico});
}
module.exports={montarIntegracaoAsaasSandboxLoopLab};
