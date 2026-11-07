'use strict';
// Prova READ-ONLY de que as chaves guardadas fora do SQLite conseguem
// recuperar identidade, pedido, cotação, remessa e trilha administrativa.
// Executar somente sobre RESTAURO ISOLADO. Nenhum PSP/fornecedor é chamado.
const {DatabaseSync}=require('node:sqlite');
const {createHmac,createHash,createDecipheriv,timingSafeEqual}=
 require('node:crypto');
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
const chaveOk=k=>Buffer.isBuffer(k)&&k.length===32;
const h=(k,s)=>createHmac('sha256',k).update(s).digest('hex');
const eq=(a,b)=>typeof a==='string'&&/^[0-9a-f]{64}$/.test(a)&&
 typeof b==='string'&&/^[0-9a-f]{64}$/.test(b)&&
 timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
function decifrar(k,row,prefix,campos=['payload_iv','payload_ct','payload_tag']){
 if(!chaveOk(k))falha('RECUPERACAO_CHAVE_COMERCIAL_AUSENTE');
 try{
  const [iv,ct,tag]=campos.map(c=>row[c]);
  if(typeof iv!=='string'||!(/^[a-f0-9]{24}$/).test(iv)||
     typeof tag!=='string'||!(/^[a-f0-9]{32}$/).test(tag)||
     typeof ct!=='string'||ct.length>4*1024*1024||
     ct.length%2!==0||!/^[0-9a-f]*$/.test(ct))
   falha('RECUPERACAO_CIFRA_DIVERGENTE');
  const d=createDecipheriv('aes-256-gcm',k,Buffer.from(iv,'hex'));
  d.setAAD(Buffer.from(prefix));d.setAuthTag(Buffer.from(tag,'hex'));
  const texto=Buffer.concat([d.update(Buffer.from(ct,'hex')),d.final()])
   .toString('utf8');
  return texto;
 }catch{falha('RECUPERACAO_CIFRA_DIVERGENTE');}
}
function provarChavesRecuperacao({arquivo,chaves}={}){
 if(typeof arquivo!=='string'||!arquivo.endsWith('.sqlite')||
    !chaves||typeof chaves!=='object')
  falha('RECUPERACAO_CHAVES_NAO_CONFIGURADA');
 const b=new DatabaseSync(arquivo,{readOnly:true});
 try{
  const nomes=new Set(b.prepare(
   "SELECT name FROM sqlite_master WHERE type='table'"
  ).all().map(r=>r.name));
  const tem=t=>nomes.has(t);
  const {chaveEmail,chaveCifra,chaveCodigo,chaveCotacoes,
   chavePedidos,chaveOutbox,chaveAuditoria}=chaves;
  if(![chaveEmail,chaveCifra,chaveCodigo].every(chaveOk))
   falha('RECUPERACAO_CHAVES_IDENTIDADE_AUSENTES');
  const c=b.prepare('SELECT * FROM loop_real_custodia WHERE id=1').get();
  const esperado=[chaveEmail,chaveCifra,chaveCodigo]
   .map((k,i)=>h(k,'LOOP-REAL-CUSTODIA-'+i+':VERSAO-1'));
  if(!c||!eq(c.email_prova,esperado[0])||
     !eq(c.cifra_prova,esperado[1])||
     !eq(c.codigo_prova,esperado[2]))
   falha('RECUPERACAO_CUSTODIA_IDENTIDADE_DIVERGENTE');
  let contas=0,cotacoes=0,pedidos=0,remessas=0,eventos=0;
  for(const r of b.prepare(
   'SELECT nome_iv,nome_ct,nome_tag,email_iv,email_ct,email_tag,email_hmac FROM loop_real_contas'
  ).iterate()){
   contas++;
   const nome=decifrar(chaveCifra,r,'LOOP-REAL-IDENTIDADE-V1',
    ['nome_iv','nome_ct','nome_tag']);
   const email=decifrar(chaveCifra,r,'LOOP-REAL-IDENTIDADE-V1',
    ['email_iv','email_ct','email_tag']);
   if(nome.length<1||email.length<3||
      !eq(r.email_hmac,h(chaveEmail,'EMAIL:'+email)))
    falha('RECUPERACAO_IDENTIDADE_CIFRA_DIVERGENTE');
  }
  const percorrer=(t,key,aad,validar)=>{let n=0;
   if(!tem(t))return n;
   for(const r of b.prepare('SELECT * FROM '+t).iterate()){
    n++;
    if(!chaveOk(key))falha('RECUPERACAO_CHAVE_COMERCIAL_AUSENTE');
    let payload;
    try{payload=JSON.parse(decifrar(key,r,aad));}
    catch{falha('RECUPERACAO_CIFRA_DIVERGENTE');}
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||
       validar(payload,r)===false)
     falha('RECUPERACAO_PAYLOAD_COMERCIAL_DIVERGENTE');
   }
   return n;
  };
  cotacoes=percorrer('loja_real_cotacoes',chaveCotacoes,
   'AKITEMM-REAL-COTACAO-V1',
   (p)=>Array.isArray(p.grupos)&&p.grupos.length>0&&
    Number.isSafeInteger(p.valorTotalCentavos)&&p.valorTotalCentavos>0);
  pedidos=percorrer('loja_real_pedidos',chavePedidos,
   'AKITEMM-PEDIDO-REAL-V1',
   (p)=>Array.isArray(p.grupos)&&p.grupos.length>0);
  remessas=percorrer('loja_real_outbox_fornecedor',chaveOutbox,
   'AKITEMM-FORNECEDOR-OUTBOX-V1',
   (p,r)=>Array.isArray(p.itens)&&p.itens.length>0&&
    eq(r.payload_hash,createHash('sha256')
     .update(JSON.stringify(p)).digest('hex')));
  if(tem('loja_real_auditoria_admin')){
   if(!chaveOk(chaveAuditoria))
    falha('RECUPERACAO_CHAVE_AUDITORIA_AUSENTE');
   let anterior='GENESE',prevId=0;
   for(const r of b.prepare(
    'SELECT * FROM loja_real_auditoria_admin ORDER BY id ASC'
   ).iterate()){
    eventos++;
    const evento={id:r.id,ocorridoEm:r.ocorrido_em,acao:r.acao,
     atorHash:r.ator_hash,entidade:r.entidade,
     revisaoAnterior:r.revisao_anterior,revisaoNova:r.revisao_nova,
     antesJson:r.antes_json,depoisJson:r.depois_json,
     hashAnterior:r.hash_anterior};
    const assinatura=h(chaveAuditoria,
     'EVENTO-ADMIN-AKITEMM-V1\n'+JSON.stringify(evento));
    if(r.id!==prevId+1||r.hash_anterior!==anterior||
       !eq(r.hash_atual,assinatura))
     falha('RECUPERACAO_AUDITORIA_HMAC_DIVERGENTE');
    anterior=r.hash_atual;prevId=r.id;
   }
  }
  return {chavesDeLeituraVerificadas:true,
   trilhaAdminVerificada:tem('loja_real_auditoria_admin'),
   contasLidas:contas,cotacoesLidas:cotacoes,
   pedidosLidos:pedidos,remessasLidas:remessas,eventosAuditados:eventos,
   custodiaExternaIndependenteComprovada:false,
   conciliacaoPspBancoComprovada:false};
 }catch(e){
  if(e.codigo)throw e;
  falha('RECUPERACAO_LEITURA_NAO_COMPROVADA');
 }finally{b.close();}
}
module.exports={provarChavesRecuperacao};
