'use strict';
// Recuperação DR (disaster recovery) somente GET e em arquivo isolado.
// Executar FORA do serviço de origem. Este módulo não configura, atesta
// nem finge custódia independente, região ou banco/PSP conciliados.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {createHash,timingSafeEqual}=require('node:crypto');
const {assinarObjetoS3Real}=require('./backup-identidade-offsite');
const {restaurarBackupIdentidadeReal}=
 require('./backup-identidade-real');
const {provarChavesRecuperacao}=require('./prova-chaves-recuperacao');
const CONTAGENS=['contas','pedidos','linhasCustos','remessas','cotacoes'];
const FLAGS=['administracaoIncluida','recuperacaoComercialIncluida'];
const OBJETO=/^clientes\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.looprealbak$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function validarManifesto(manifesto){
 if(!manifesto||typeof manifesto!=='object'||Array.isArray(manifesto)||
    typeof manifesto.chaveObjeto!=='string'||
    !OBJETO.test(manifesto.chaveObjeto)||
    !/^[0-9a-f]{64}$/.test(manifesto.sha256Cifrado||'')||
    !Number.isSafeInteger(manifesto.bytes)||manifesto.bytes<57||
    CONTAGENS.some(k=>!Number.isSafeInteger(manifesto[k])||manifesto[k]<0)||
    FLAGS.some(k=>typeof manifesto[k]!=='boolean'))
  falha('RECUPERACAO_INDEPENDENTE_MANIFESTO_INVALIDO');
 return manifesto;
}
function mesmoHash(a,b){
 return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
async function provarRecuperacaoIndependente({
 config,manifesto,chaveBackup,chavesRecuperacao,
 buscar=fetch,agora=()=>new Date(),maxBytes=536870912
}={}){
 const m=validarManifesto(manifesto);
 if(!Buffer.isBuffer(chaveBackup)||chaveBackup.length!==32||
    !chavesRecuperacao||typeof chavesRecuperacao!=='object'||
    typeof buscar!=='function'||typeof agora!=='function'||
    !Number.isSafeInteger(maxBytes)||maxBytes<57||
    m.bytes>maxBytes)
  falha('RECUPERACAO_INDEPENDENTE_CONFIG_INVALIDA');
 // O identificador e o SHA do manifesto devem ter sido guardados FORA
 // do bucket e da instância original; o GET sozinho não atesta autoria.
 const url=assinarObjetoS3Real({
  config,key:m.chaveObjeto,method:'GET',agora:agora()
 });
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'loop-real-dr-isolado-'));
 fs.chmodSync(tmp,0o700);
 const baixado=path.join(tmp,'objeto.looprealbak');
 const restaurado=path.join(tmp,'restaurado.sqlite');
 try{
  let resposta;
  try{
   resposta=await buscar(url,{
    method:'GET',redirect:'error',signal:AbortSignal.timeout(120000)
   });
  }catch{falha('RECUPERACAO_INDEPENDENTE_GET_FALHOU');}
  if(resposta?.status!==200||!resposta.body)
   falha('RECUPERACAO_INDEPENDENTE_GET_FALHOU');
  const header=resposta.headers?.get?.('content-length');
  if(header!==null&&header!==undefined&&(
     !/^\d+$/.test(header)||Number(header)>maxBytes||
     Number(header)!==m.bytes))
   falha('RECUPERACAO_INDEPENDENTE_TAMANHO_DIVERGENTE');
  const hash=createHash('sha256');let bytes=0;
  const conferir=new Transform({
   transform(parte,_enc,done){
    bytes+=parte.length;
    if(bytes>maxBytes||bytes>m.bytes)
     return done(Object.assign(Error('LIMITE_DR'),{
      codigo:'RECUPERACAO_INDEPENDENTE_TAMANHO_DIVERGENTE'
     }));
    hash.update(parte);done(null,parte);
   }
  });
  try{
   await pipeline(Readable.fromWeb(resposta.body),conferir,
    fs.createWriteStream(baixado,{flags:'wx',mode:0o600}));
  }catch{
   falha('RECUPERACAO_INDEPENDENTE_DOWNLOAD_INCOMPLETO');
  }
  if(bytes!==m.bytes)
   falha('RECUPERACAO_INDEPENDENTE_TAMANHO_DIVERGENTE');
  if(!mesmoHash(hash.digest('hex'),m.sha256Cifrado))
   falha('RECUPERACAO_INDEPENDENTE_HASH_DIVERGENTE');
  const restauracao=await restaurarBackupIdentidadeReal({
   origem:baixado,destino:restaurado,chaveBackup,autorizado:true
  });
  if(restauracao.integridadeSQLite!=='ok'||
     CONTAGENS.some(k=>restauracao[k]!==m[k])||
     FLAGS.some(k=>restauracao[k]!==m[k]))
   falha('RECUPERACAO_INDEPENDENTE_DADOS_DIVERGENTES');
  const chaves=provarChavesRecuperacao({
   arquivo:restaurado,chaves:chavesRecuperacao
  });
  if(chaves.chavesDeLeituraVerificadas!==true||
     chaves.contasLidas!==m.contas||
     chaves.pedidosLidos!==m.pedidos||
     chaves.remessasLidas!==m.remessas||
     chaves.cotacoesLidas!==m.cotacoes||
     (m.administracaoIncluida&&chaves.trilhaAdminVerificada!==true))
   falha('RECUPERACAO_INDEPENDENTE_CHAVES_DIVERGENTES');
  return {
   estado:'OBJETO_CIFRADO_BAIXADO_RESTAURADO_E_LIDO',
   somenteGet:true,hashExternoConferido:true,
   chavesDeLeituraVerificadas:true,sessoesRestauradasRevogadas:true,
   // Conta apenas evidência do teste executado. Não autoatestar região,
   // independência de fornecedor, autoria do manifesto ou liquidação.
   custodiaExternaIndependenteComprovada:false,
   recuperacaoOutraRegiaoComprovada:false,
   conciliacaoPspBancoComprovada:false,
   financeiroRealHabilitado:false,checkoutRealHabilitado:false,
   remessasNaoReenviadas:true,
   contas:m.contas,pedidos:m.pedidos,
   linhasCustos:m.linhasCustos,remessas:m.remessas,cotacoes:m.cotacoes,
   semDadosPessoaisNoRelatorio:true
  };
 }catch(e){
  if(e.codigo)throw e;
  falha('RECUPERACAO_INDEPENDENTE_INCONCLUSIVA');
 }finally{
  fs.rmSync(tmp,{recursive:true,force:true});
 }
}
module.exports={validarManifesto,provarRecuperacaoIndependente};