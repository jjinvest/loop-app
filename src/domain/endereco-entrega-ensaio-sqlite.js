'use strict';
// Endereço de ENSAIO: mesmo titular/SQLite do checkout, cifrado em repouso.
// Nunca enviar dados a distribuidor nem habilitar expedição/contratação de frete.
const {randomBytes,createHmac,createCipheriv,createDecipheriv}=
 require('node:crypto');
const TITULAR=/^titular-[a-f0-9-]{36}$/;
const PEDIDO=/^hom-[a-f0-9-]{36}$/;
const UF=new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const CAMPOS=Object.freeze({
 destinatario:100,cep:9,logradouro:120,numero:20,complemento:100,
 bairro:80,cidade:90,uf:2,telefone:24,referencia:150
});
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function titular(id){if(typeof id!=='string'||!TITULAR.test(id))falha('SESSAO_INVALIDA');}
function validar(valor){
 if(!valor||typeof valor!=='object'||Array.isArray(valor)||
    Object.keys(valor).sort().join(',')!==Object.keys(CAMPOS).sort().join(','))
  falha('ENDERECO_CAMPOS_INVALIDOS');
 const dados={};
 for(const [k,max] of Object.entries(CAMPOS)){
  const v=valor[k];
  if(typeof v!=='string'||v.length>max||
     /[\u0000-\u001f\u007f<>]/.test(v))falha('ENDERECO_CAMPOS_INVALIDOS');
  dados[k]=v.trim();
 }
 for(const campo of ['destinatario','logradouro','numero','bairro','cidade'])
  if(dados[campo].length<2)falha('ENDERECO_CAMPOS_INVALIDOS');
 const cep=dados.cep.replace('-','');
 if(!/^[0-9]{8}$/.test(cep))falha('ENDERECO_CEP_INVALIDO');
 dados.cep=cep.slice(0,5)+'-'+cep.slice(5);
 if(!UF.has(dados.uf))falha('ENDERECO_UF_INVALIDA');
 const tel=dados.telefone.replace(/[\s()+-]/g,'');
 if(!/^[0-9]{10,11}$/.test(tel))falha('ENDERECO_TELEFONE_INVALIDO');
 dados.telefone=tel;
 return dados;
}
class EnderecoEntregaEnsaioSQLite{
 constructor({banco,chaveCifra,agora=()=>Date.now()}={}){
  if(process.env.NODE_ENV==='production')falha('ENDERECO_LAB_PROIBIDO_PRODUCAO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     !Buffer.isBuffer(chaveCifra)||chaveCifra.length!==32)
   falha('ENDERECO_SQLITE_CUSTODIA_INVALIDOS');
  this.banco=banco;this.agora=agora;
  this.key=createHmac('sha256',chaveCifra)
   .update('LOOP-ENDERECO-LAB-CHAVE-SEPARADA-V1').digest();
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_endereco_ensaio_titular(',
   'titular_id TEXT PRIMARY KEY NOT NULL REFERENCES',
   'akitemm_conta_unica_candidata(id) ON DELETE RESTRICT,',
   'iv BLOB NOT NULL,cifra BLOB NOT NULL,tag BLOB NOT NULL,',
   'revisao INTEGER NOT NULL CHECK(revisao>=1),atualizado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_endereco_ensaio_prepedido(',
   'prepedido_id TEXT PRIMARY KEY NOT NULL REFERENCES',
   'akitemm_checkout_prepedidos_staging(prepedido_id) ON DELETE RESTRICT,',
   'titular_id TEXT NOT NULL REFERENCES',
   'akitemm_conta_unica_candidata(id) ON DELETE RESTRICT,',
   'iv BLOB NOT NULL,cifra BLOB NOT NULL,tag BLOB NOT NULL,',
   'revisao_origem INTEGER NOT NULL CHECK(revisao_origem>=1),criado_em INTEGER NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS loop_endereco_pedido_no_update',
   'BEFORE UPDATE ON loop_endereco_ensaio_prepedido',
   "BEGIN SELECT RAISE(ABORT,'endereco do prepedido imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_endereco_pedido_no_delete',
   'BEFORE DELETE ON loop_endereco_ensaio_prepedido',
   "BEGIN SELECT RAISE(ABORT,'endereco do prepedido imutavel'); END;",
   'CREATE TABLE IF NOT EXISTS loop_endereco_ensaio_auditoria(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,titular_id TEXT NOT NULL,',
   'evento TEXT NOT NULL,rev INTEGER NOT NULL,em INTEGER NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS loop_endereco_audit_no_update',
   'BEFORE UPDATE ON loop_endereco_ensaio_auditoria',
   "BEGIN SELECT RAISE(ABORT,'auditoria imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_endereco_audit_no_delete',
   'BEFORE DELETE ON loop_endereco_ensaio_auditoria',
   "BEGIN SELECT RAISE(ABORT,'auditoria imutavel'); END;"
  ].join(' '));
 }
 _selar(dados,titularId,contexto){
  const iv=randomBytes(12);
  const enc=createCipheriv('aes-256-gcm',this.key,iv);
  enc.setAAD(Buffer.from('LOOP-ENDERECO-LAB-V1|'+titularId+'|'+contexto));
  const cifra=Buffer.concat([enc.update(JSON.stringify(dados),'utf8'),enc.final()]);
  return {iv,cifra,tag:enc.getAuthTag()};
 }
 _abrir(row,titularId,contexto){
  const dec=createDecipheriv('aes-256-gcm',this.key,Buffer.from(row.iv));
  dec.setAAD(Buffer.from('LOOP-ENDERECO-LAB-V1|'+titularId+'|'+contexto));
  dec.setAuthTag(Buffer.from(row.tag));
  return validar(JSON.parse(Buffer.concat([
   dec.update(Buffer.from(row.cifra)),dec.final()
  ]).toString('utf8')));
 }
 consultar(titularId){
  titular(titularId);
  const row=this.banco.prepare(
   'SELECT * FROM loop_endereco_ensaio_titular WHERE titular_id=?'
  ).get(titularId);
  return {entrega:row?this._abrir(row,titularId,'CADASTRO'):null,
   revisao:row?.revisao||0,semEntregaReal:true,freteCalculado:false,
   entregueAoFornecedor:false,apenasEnsaio:true};
 }
 salvar(titularId,entrada){
  titular(titularId);const dados=validar(entrada);
  const agora=this.agora();
  if(!Number.isSafeInteger(agora)||agora<=0)falha('ENDERECO_RELOGIO_INVALIDO');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const row=this.banco.prepare(
    'SELECT revisao FROM loop_endereco_ensaio_titular WHERE titular_id=?'
   ).get(titularId);
   const revisao=(row?.revisao||0)+1;
   const selado=this._selar(dados,titularId,'CADASTRO');
   this.banco.prepare([
    'INSERT INTO loop_endereco_ensaio_titular',
    '(titular_id,iv,cifra,tag,revisao,atualizado_em)',
    'VALUES(?,?,?,?,?,?) ON CONFLICT(titular_id) DO UPDATE SET',
    'iv=excluded.iv,cifra=excluded.cifra,tag=excluded.tag,',
    'revisao=excluded.revisao,atualizado_em=excluded.atualizado_em'
   ].join(' ')).run(titularId,selado.iv,selado.cifra,selado.tag,revisao,agora);
   this.banco.prepare([
    'INSERT INTO loop_endereco_ensaio_auditoria(titular_id,evento,rev,em)',
    "VALUES(?,'SALVAR_ENDERECO',?,?)"
   ].join(' ')).run(titularId,revisao,agora);
   this.banco.exec('COMMIT');
   return {entrega:dados,revisao,semEntregaReal:true,
    freteCalculado:false,entregueAoFornecedor:false,apenasEnsaio:true};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 // Chamado dentro da transação IMEDIATA de prePedidos.preparar.
 // Se faltar endereço físico, o prepedido inteiro sofre ROLLBACK.
 vincularPrepedido({titularId,prepedidoId,itens}={}){
  titular(titularId);
  if(typeof prepedidoId!=='string'||!PEDIDO.test(prepedidoId)||
     !Array.isArray(itens))falha('ENDERECO_PREPEDIDO_INVALIDO');
  if(!itens.some(x=>x.tipo==='FISICO'))return {fisico:false};
  const row=this.banco.prepare(
   'SELECT * FROM loop_endereco_ensaio_titular WHERE titular_id=?'
  ).get(titularId);
  if(!row)falha('ENDERECO_OBRIGATORIO_PRODUTO_FISICO');
  const dados=this._abrir(row,titularId,'CADASTRO');
  const selado=this._selar(dados,titularId,'PREPEDIDO:'+prepedidoId);
  const r=this.banco.prepare([
   'INSERT INTO loop_endereco_ensaio_prepedido',
   '(prepedido_id,titular_id,iv,cifra,tag,revisao_origem,criado_em)',
   'VALUES(?,?,?,?,?,?,?)'
  ].join(' ')).run(prepedidoId,titularId,selado.iv,selado.cifra,
   selado.tag,row.revisao,this.agora());
  if(r.changes!==1)falha('ENDERECO_FOTOGRAFIA_NAO_SALVA');
  return {fisico:true,enderecoCifrado:true};
 }
 consultarPrepedido({titularId,prepedidoId}={}){
  titular(titularId);
  if(typeof prepedidoId!=='string'||!PEDIDO.test(prepedidoId))
   falha('ENDERECO_PREPEDIDO_INVALIDO');
  const row=this.banco.prepare([
   'SELECT * FROM loop_endereco_ensaio_prepedido',
   'WHERE prepedido_id=? AND titular_id=?'
  ].join(' ')).get(prepedidoId,titularId);
  return row?{endereco:this._abrir(row,titularId,'PREPEDIDO:'+prepedidoId),
   revisaoOrigem:row.revisao_origem,semEntregaReal:true}:null;
 }
}
module.exports={EnderecoEntregaEnsaioSQLite};
