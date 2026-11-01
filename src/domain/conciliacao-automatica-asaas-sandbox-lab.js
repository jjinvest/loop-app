'use strict';
// Processador local de laboratorio: sem webhook publico, sem credenciais reais.
// A reconsulta remota e validacao de titularidade permanecem no conciliador.
class ConciliacaoAutomaticaAsaasSandboxLab{
 constructor({conciliador,intervaloMs=1000,aoErro=()=>{},listarPendentes=null,
  maxPorVerificacao=20}={}){
  if(typeof conciliador?.processar!=='function')throw new TypeError('Conciliador obrigatorio');
  if(!Number.isSafeInteger(intervaloMs)||intervaloMs<100)throw new RangeError('Intervalo invalido');
  if(listarPendentes!==null&&typeof listarPendentes!=='function')
   throw new TypeError('Consulta de pendentes invalida');
  if(!Number.isSafeInteger(maxPorVerificacao)||maxPorVerificacao<1||maxPorVerificacao>100)
   throw new RangeError('Limite de pedidos por rodada invalido');
  this.conciliador=conciliador;this.intervaloMs=intervaloMs;this.aoErro=aoErro;
  this.listarPendentes=listarPendentes;
  this.maxPorVerificacao=maxPorVerificacao;
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
  // Copiar apenas os proximos IDs: jamais materializar a fila inteira
  // quando milhares de cobrancas aguardam confirmacao no SQLite.
  const candidatos=[];
  for(const id of this.pendentes){
   candidatos.push(id);
   if(candidatos.length>=this.maxPorVerificacao)break;
  }
  let verificados=0;
  for(const pedidoId of candidatos){
   if(verificados>=this.maxPorVerificacao)break;
   if(this.emAndamento.has(pedidoId))continue;
   verificados++;
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
   finally{
    this.emAndamento.delete(pedidoId);
    // Rodizio: pedido que falhou vai ao fim da fila e nao impede outros
    // de serem conferidos nas proximas rodadas. Sem gravar pagamento aqui.
    if(this.pendentes.has(pedidoId)){
     this.pendentes.delete(pedidoId);
     this.pendentes.add(pedidoId);
    }
   }
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
