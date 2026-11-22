'use strict';
// Rascunho do FORMULÁRIO de operador: nunca publica produto, foto,
// checkout ou fila. Dados em SQLite real, isolados das contas de clientes.
const {randomUUID}=require('node:crypto');
const ID=/^[a-f0-9-]{36}$/;
const CHAVES=['titulo','descricao','codigo','corDescricao','classificacao',
 'origem','fornecedorNome','fornecedorSku','fornecedorContato','categoria',
 'marca','precoNormal','precoPromocional','quantidade','entregaModo',
 'entregaUf','entregaMunicipios','entregaTaxa'];
const MAX=Object.freeze({
 titulo:150,descricao:2000,codigo:80,corDescricao:120,classificacao:20,
 origem:32,fornecedorNome:90,fornecedorSku:80,fornecedorContato:160,
 categoria:70,marca:70,precoNormal:14,precoPromocional:14,quantidade:10,
 entregaModo:20,entregaUf:2,entregaMunicipios:1200,entregaTaxa:14
});
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validar(campos){
 if(!campos||Array.isArray(campos)||typeof campos!=='object'||
    Object.keys(campos).sort().join(',')!==CHAVES.slice().sort().join(','))
  falha('RASCUNHO_CAMPOS_INVALIDOS');
 for(const k of CHAVES){
  const v=campos[k];
  if(typeof v!=='string'||v.length>MAX[k]||
     /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))
   falha('RASCUNHO_CAMPO_INVALIDO_'+k);
 }
 return Object.fromEntries(CHAVES.map(k=>[k,campos[k]]));
}
class RascunhosCadastroAkitemmSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(typeof banco?.exec!=='function'||typeof banco?.prepare!=='function'||
     typeof agora!=='function')falha('RASCUNHO_BANCO_INVALIDO');
  this.banco=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_rascunhos_cadastro(',
   'id TEXT PRIMARY KEY,campos_json TEXT NOT NULL,',
   'revisao INTEGER NOT NULL CHECK(revisao>=1),',
   'atualizado_em INTEGER NOT NULL CHECK(atualizado_em>0));'
  ].join(' '));
 }
 listar(){
  return this.banco.prepare([
   'SELECT id,campos_json,revisao,atualizado_em',
   'FROM loja_real_rascunhos_cadastro',
   'ORDER BY atualizado_em DESC LIMIT 50'
  ].join(' ')).all().map(r=>{
   let campos;
   try{campos=validar(JSON.parse(r.campos_json));}
   catch{falha('RASCUNHO_CONTEUDO_INCONSISTENTE');}
   return {id:r.id,campos,revisao:r.revisao,atualizadoEm:r.atualizado_em,
    publicado:false,imagemSalva:false};
  });
 }
 salvar({id=null,campos,revisaoEsperada=0}={}){
  const validos=validar(campos),ts=this.agora();
  if((id!==null&&(typeof id!=='string'||!ID.test(id)))||
     !Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0||
     !Number.isSafeInteger(ts)||ts<1)falha('RASCUNHO_DADOS_INVALIDOS');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const n=this.banco.prepare(
    'SELECT COUNT(*) AS n FROM loja_real_rascunhos_cadastro'
   ).get().n;
   const atual=id?this.banco.prepare([
    'SELECT revisao FROM loja_real_rascunhos_cadastro WHERE id=?'
   ].join(' ')).get(id):null;
   if(revisaoEsperada!==(atual?.revisao??0))
    falha('RASCUNHO_REVISAO_CONCORRENTE');
   if(!atual&&n>=50)falha('RASCUNHO_LIMITE_50');
   const novoId=id||randomUUID(),revisao=revisaoEsperada+1;
   this.banco.prepare([
    'INSERT INTO loja_real_rascunhos_cadastro',
    '(id,campos_json,revisao,atualizado_em) VALUES(?,?,?,?)',
    'ON CONFLICT(id) DO UPDATE SET',
    'campos_json=excluded.campos_json,revisao=excluded.revisao,',
    'atualizado_em=excluded.atualizado_em'
   ].join(' ')).run(novoId,JSON.stringify(validos),revisao,ts);
   this.banco.exec('COMMIT');
   return {id:novoId,revisao,atualizadoEm:ts,publicado:false,
    imagemSalva:false};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 excluir(id){
  if(typeof id!=='string'||!ID.test(id))
   falha('RASCUNHO_ID_INVALIDO');
  const r=this.banco.prepare([
   'DELETE FROM loja_real_rascunhos_cadastro WHERE id=?'
  ].join(' ')).run(id);
  return {excluido:r.changes===1,id};
 }
}
module.exports={RascunhosCadastroAkitemmSQLite,CHAVES};