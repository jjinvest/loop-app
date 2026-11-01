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
   catch(e){this.aoErro(e,null);}
  }
  for(const pedidoId of [...this.pendentes]){
   if(this.emAndamento.has(pedidoId))continue;
   this.emAndamento.add(pedidoId);
   try{
    const r=await this.conciliador.processar(pedidoId);
    if(r?.posicoesNoPedido===1&&r?.confirmacaoIndividualObrigatoria===true)
     this.pendentes.delete(pedidoId);
   }catch(e){this.aoErro(e,pedidoId);}
   finally{this.emAndamento.delete(pedidoId);}
  }
 }
 iniciar(){
  if(this.timer)return;
  this.timer=setInterval(()=>{void this.verificar();},this.intervaloMs);
  this.timer.unref?.();
 }
 parar(){if(this.timer){clearInterval(this.timer);this.timer=null;}}
}
module.exports={ConciliacaoAutomaticaAsaasSandboxLab};
