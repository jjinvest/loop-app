'use strict';
// Montagem exclusivamente local. Nao expor em HTTP ou producao.
const {AsaasSandboxLojaV6}=require('./asaas-sandbox-loja-v6');
const {CobrancasAkitemmAsaasSandboxSQLite}=require('./cobrancas-akitemm-asaas-sandbox-v6');
const {ComprovanteAsaasSandboxPonteLab}=require('./comprovante-asaas-sandbox-ponte-lab');
const {PonteElegibilidadeAsaasTitularidadeLab}=require('./ponte-elegibilidade-asaas-titularidade-lab');
const {PonteComprasConvitesDemoSQLite}=require('./ponte-compras-convites-demo-sqlite');
const {CatracaAsaasSandboxLab}=require('./catraca-asaas-sandbox-lab');
const {ConciliadorPosicaoAsaasSandboxLab}=require('./conciliador-posicao-asaas-sandbox-lab');
function montarIntegracaoAsaasSandboxLoopLab({banco,contas,titularidade,apiKey,fetchImpl,provedor,agora}={}){
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
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco,contas,pedidosIdentificados:titularidade,
  consultarPagamentoConfiavel:pedidoId=>comprovantes.consultar(pedidoId),
  atribuicaoManualPorPosicao:true
 });
 const catraca=new CatracaAsaasSandboxLab({elegibilidade,ponte});
 const conciliador=new ConciliadorPosicaoAsaasSandboxLab({cobrancas,catraca});
 return Object.freeze({provedor:externo,cobrancas,comprovantes,elegibilidade,ponte,catraca,conciliador});
}
module.exports={montarIntegracaoAsaasSandboxLoopLab};
