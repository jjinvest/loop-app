'use strict';
// Processador local de laboratorio: sem webhook publico, sem credenciais reais.
// A reconsulta remota e validacao de titularidade permanecem no conciliador.
class ConciliacaoAutomaticaAsaasSandboxLab{
 constructor({conciliador,intervaloMs=1000,aoErro=()=>{},listarPendentes=null}={}){
  if(typeof conciliador?.processar!=='function')throw new TypeError('Conciliador obrigatorio');
  if(!Number.isSafeInteger(intervaloMs)||intervaloMs<100)throw new RangeError('Intervalo invalido');
  if(listarPendentes!==null&&typeof listarPendentes!=='function')
   throw new TypeError('Consulta de pendentes invalida');
  this.conciliador=conciliador;this.intervaloMs=intervaloMs;this.aoErro=aoErro;
  this.listarPendentes=listarPendentes;
  this.pendentes=new Set();this.emAndamento=new Set();this.timer=null;
  this.verificacaoEmCurso=null;
  this.falhasAgendador=0;this.ultimaFalhaAgendador=null;
 }
 _registrarFalhaAgendador(){
  // Codigo fixo: jamais expor erro bruto ou dados privados na telemetria.
  this.falhasAgendador++;
  this.ultimaFalhaAgendador={codigo:'FALHA_INTERNA_AGENDADOR',registradoEm:new Date().toISOString()};
 }
 async _notificarErro(erro,pedidoId){
  // Um observador defeituoso nao deve impedir a conciliacao dos outros pedidos.
  try{await this.aoErro(erro,pedidoId);}
  catch{this._registrarFalhaAgendador();}
 }
 acompanhar(pedidoId){
  if(typeof pedidoId!=='string'||!/^[a-z0-9][a-z0-9-]{2,69}$/.test(pedidoId))
   throw new TypeError('Pedido invalido');
  this.pendentes.add(pedidoId);
 }
 async verificar(){
  if(this.verificacaoEmCurso)return this.verificacaoEmCurso;
  this.verificacaoEmCurso=this._verificarInterno();
  try{return await this.verificacaoEmCurso;}
  finally{this.verificacaoEmCurso=null;}
 }
 async _verificarInterno(){
  if(this.listarPendentes){
   try{for(const id of await this.listarPendentes())this.acompanhar(id);}
   catch(e){await this._notificarErro(e,null);}
  }
  for(const pedidoId of [...this.pendentes]){
   if(this.emAndamento.has(pedidoId))continue;
   this.emAndamento.add(pedidoId);
   try{
    const r=await this.conciliador.processar(pedidoId);
    if((Number.isSafeInteger(r?.posicoesNoPedido)&&r.posicoesNoPedido>=1&&
        r.posicoesNoPedido<=10&&r?.confirmacaoIndividualObrigatoria===true)||
       (r?.posicoesNoPedido===0&&r?.vendaSomenteLoja===true))
     this.pendentes.delete(pedidoId);
   }catch(e){
    // Reversao e terminal neste laboratorio. Conservar posicao e trilha,
    // notificar a revisao e nao repetir eternamente a mesma tentativa.
    try{
     if(this.conciliador.cobrancas?.consultar(pedidoId)?.status==='REVERSAO_INFORMADA_SANDBOX')
      this.pendentes.delete(pedidoId);
    }catch{
     // Falha no status nao deve impedir a verificacao dos demais pedidos.
     this._registrarFalhaAgendador();
    }
    await this._notificarErro(e,pedidoId);
   }
   finally{this.emAndamento.delete(pedidoId);}
  }
 }
 iniciar(){
  if(this.timer)return;
  this.timer=setInterval(()=>{
   void this.verificar().catch(()=>{
    // Rejeicoes do timer nao podem interromper a aplicacao de laboratorio.
    // Nunca gravar erros brutos ou credenciais do PSP na telemetria.
    this._registrarFalhaAgendador();
   });
  },this.intervaloMs);
  this.timer.unref?.();
 }
 parar(){if(this.timer){clearInterval(this.timer);this.timer=null;}}
}
module.exports={ConciliacaoAutomaticaAsaasSandboxLab};
