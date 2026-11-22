'use strict';
// Cofres do LOOP: projeção APENAS DE LEITURA para o operador.
// Não confundir saldo real conciliado com reservas, eventos do relógio,
// provisões internas, valores de laboratório ou saldo de cliente.
// Sem adaptador de PSP/banco autenticado, o saldo permanece desconhecido.
const COFRES=Object.freeze([
 Object.freeze({codigo:'INVESTIMENTO',nome:'Investimento'}),
 Object.freeze({codigo:'CENTRAL',nome:'Cofre Central LOOP'}),
 Object.freeze({codigo:'RESERVA',nome:'Reserva'})
]);
const CODIGOS=new Set(COFRES.map(x=>x.codigo));
const PROVA_ID=/^[A-Za-z0-9._:-]{8,160}$/;
function falha(codigo){
 const e=new Error(codigo);e.codigo=codigo;throw e;
}
function validarAdaptador(adaptador){
 if(adaptador===null)return;
 if(!adaptador||typeof adaptador!=='object'||
    typeof adaptador.consultarSaldosConciliados!=='function'||
    typeof adaptador.comprovarSaldo!=='function')
  falha('COFRES_ADAPTADOR_EXTERNO_INVALIDO');
}
function vazios(){
 return COFRES.map(({codigo,nome})=>({
  codigo,nome,saldoCentavos:null,atualizadoEm:null,
  estado:'AGUARDANDO_CONCILIACAO'
 }));
}
async function consultarCofresOperador({adaptador=null,agoraMs=Date.now()}={}){
 validarAdaptador(adaptador);
 if(!Number.isSafeInteger(agoraMs)||agoraMs<=0)
  falha('COFRES_RELOGIO_INVALIDO');
 if(!adaptador)return {
  fonte:'SEM_ADAPTADOR_PSP_BANCO_HOMOLOGADO',
  estado:'AGUARDANDO_CONCILIACAO_EXTERNA',
  moeda:'BRL',cofres:vazios(),atualizadoEm:null,
  dinheiroRealComprovado:false,saquesHabilitados:false,
  movimentacoesHabilitadas:false,somenteLeitura:true
 };
 // Este adaptador DEVE verificar autenticidade, titularidade, liquidação,
 // extrato, reversões e segregação por cofre; nunca aceitar valores do HTTP.
 const resposta=await adaptador.consultarSaldosConciliados();
 if(!resposta||!Array.isArray(resposta.cofres)||
    resposta.cofres.length>COFRES.length)
  falha('COFRES_EXTRATO_INVALIDO');
 const mapa=new Map(),provas=new Set();
 for(const item of resposta.cofres){
  if(!item||!CODIGOS.has(item.codigo)||mapa.has(item.codigo)||
     item.moeda!=='BRL'||
     item.tipo!=='SALDO_LIQUIDADO_CONCILIADO'||
     !Number.isSafeInteger(item.saldoCentavos)||
     item.saldoCentavos<0||item.saldoCentavos>1e12||
     !Number.isSafeInteger(item.conciliadoEm)||
     item.conciliadoEm<=0||
     !PROVA_ID.test(item.comprovanteId||'')||
     provas.has(item.comprovanteId))
   falha('COFRES_EXTRATO_INVALIDO');
  mapa.set(item.codigo,item);
  provas.add(item.comprovanteId);
 }
 const exibidos=[];
 for(const {codigo,nome} of COFRES){
  const item=mapa.get(codigo);
  if(!item){
   exibidos.push({codigo,nome,saldoCentavos:null,
    atualizadoEm:null,estado:'AGUARDANDO_CONCILIACAO'});
   continue;
  }
  // Prova vencida não vira saldo atual, nem mesmo se o saldo for zero.
  // 15 minutos exigem atualização periódica quando o banco estiver ligado.
  const fresco=agoraMs-item.conciliadoEm>=0&&
   agoraMs-item.conciliadoEm<=15*60*1000;
  if(!fresco){
   exibidos.push({codigo,nome,saldoCentavos:null,
    atualizadoEm:null,estado:'CONCILIACAO_DESATUALIZADA'});
   continue;
  }
  const comprovado=await adaptador.comprovarSaldo(item);
  if(comprovado!==true)
   falha('COFRES_PROVA_EXTERNA_INVALIDA');
  exibidos.push({codigo,nome,saldoCentavos:item.saldoCentavos,
   atualizadoEm:item.conciliadoEm,estado:'CONCILIADO'});
 }
 const pronto=exibidos.filter(x=>x.estado==='CONCILIADO');
 return {
  fonte:'ADAPTADOR_PSP_BANCO_AUTENTICADO',
  estado:pronto.length===COFRES.length?'CONCILIADO':
   pronto.length?'CONCILIACAO_PARCIAL':'AGUARDANDO_CONCILIACAO_EXTERNA',
  moeda:'BRL',cofres:exibidos,
  atualizadoEm:pronto.length?Math.min(...pronto.map(x=>x.atualizadoEm)):null,
  dinheiroRealComprovado:pronto.length>0,
  saquesHabilitados:false,movimentacoesHabilitadas:false,somenteLeitura:true
 };
}
module.exports={COFRES,consultarCofresOperador};
