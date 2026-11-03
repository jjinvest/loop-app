'use strict';
// Ponte de IDENTIDADE somente para ensaio LOCAL: nao une contas por nome,
// nick ou email. Exige sessao Checkout + CSRF e senha da conta do Escritório
// ficticio verificada pelo repositorio existente. Sem migrar dados financeiros.
const TITULAR=/^titular-[a-f0-9-]{36}$/;
const CONTA=/^[a-f0-9-]{36}$/;
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
class VinculosContasEscritorioCheckoutStagingSQLite{
 constructor({banco,autenticacao,contasDemo}={}){
  if(process.env.NODE_ENV==='production')erro('VINCULO_PROIBIDO_EM_PRODUCAO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     autenticacao?.banco!==banco||contasDemo?.banco!==banco||
     typeof autenticacao.sessao!=='function'||
     typeof autenticacao.autorizarMutacao!=='function'||
     typeof contasDemo.autenticar!=='function')
   throw new TypeError('Sessao Checkout, cadastro demonstrativo e mesmo SQLite obrigatorios');
  this.banco=banco;this.autenticacao=autenticacao;this.contasDemo=contasDemo;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_checkout_escritorio_vinculos_staging(',
   'titular_checkout_id TEXT PRIMARY KEY NOT NULL REFERENCES',
   'akitemm_checkout_staging_contas(id) ON DELETE RESTRICT,',
   'conta_escritorio_demo_id TEXT NOT NULL UNIQUE REFERENCES',
   'admin_contas_participantes_demo(id) ON DELETE RESTRICT,',
   'criado_em TEXT NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS checkout_escritorio_vinculo_no_update',
   'BEFORE UPDATE ON akitemm_checkout_escritorio_vinculos_staging',
   "BEGIN SELECT RAISE(ABORT,'vinculo de identidade imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS checkout_escritorio_vinculo_no_delete',
   'BEFORE DELETE ON akitemm_checkout_escritorio_vinculos_staging',
   "BEGIN SELECT RAISE(ABORT,'vinculo de identidade imutavel'); END;"
  ].join(' '));
 }
 consultar({titularCheckoutId}={}){
  if(typeof titularCheckoutId!=='string'||!TITULAR.test(titularCheckoutId))
   erro('SESSAO_INVALIDA');
  const row=this.banco.prepare([
   'SELECT conta_escritorio_demo_id AS contaDemoId,criado_em AS criadoEm',
   'FROM akitemm_checkout_escritorio_vinculos_staging',
   'WHERE titular_checkout_id=?'
  ].join(' ')).get(titularCheckoutId);
  return row?{vinculoConfirmadoNoEnsaio:true,criadoEm:row.criadoEm,
   contaDemoId:row.contaDemoId,pagamentosReais:0,posicoesReais:0}:null;
 }
 vincularPorDuplaAutenticacao({req,nomeContaDemo,senhaContaDemo}={}){
  if(process.env.NODE_ENV==='production')erro('VINCULO_PROIBIDO_EM_PRODUCAO');
  const sessao=this.autenticacao.sessao(req);
  if(!sessao||!this.autenticacao.autorizarMutacao(req))
   erro('SESSAO_OU_CSRF_INVALIDO');
  if(typeof nomeContaDemo!=='string'||nomeContaDemo.length<3||
     nomeContaDemo.length>60||typeof senhaContaDemo!=='string'||
     senhaContaDemo.length<10||senhaContaDemo.length>128)
   erro('CREDENCIAIS_INVALIDAS');
  let conta;
  try{conta=this.contasDemo.autenticar({
   nome:nomeContaDemo,senha:senhaContaDemo
  }).conta;}catch{erro('CREDENCIAIS_INVALIDAS');}
  const titularId=sessao.titularId,contaId=conta.contaId;
  if(!TITULAR.test(titularId)||!CONTA.test(contaId))
   erro('IDENTIDADES_INCONSISTENTES');
  const agora=new Date().toISOString();
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.banco.prepare([
    'SELECT titular_checkout_id,conta_escritorio_demo_id',
    'FROM akitemm_checkout_escritorio_vinculos_staging',
    'WHERE titular_checkout_id=? OR conta_escritorio_demo_id=?'
   ].join(' ')).all(titularId,contaId);
   if(atual.length>0){
    if(atual.length!==1||atual[0].titular_checkout_id!==titularId||
       atual[0].conta_escritorio_demo_id!==contaId)
     erro('VINCULO_JA_PERTENCE_A_OUTRA_CONTA');
    this.banco.exec('COMMIT');
    return {vinculoConfirmadoNoEnsaio:true,repetido:true,
     contasVinculadas:1,pagamentosReais:0,posicoesReais:0};
   }
   const checkout=this.banco.prepare([
    'SELECT id FROM akitemm_checkout_staging_contas WHERE id=?'
   ].join(' ')).get(titularId);
   const demo=this.banco.prepare([
    'SELECT id FROM admin_contas_participantes_demo WHERE id=?'
   ].join(' ')).get(contaId);
   if(!checkout||!demo)erro('IDENTIDADES_INCONSISTENTES');
   this.banco.prepare([
    'INSERT INTO akitemm_checkout_escritorio_vinculos_staging',
    '(titular_checkout_id,conta_escritorio_demo_id,criado_em)',
    'VALUES(?,?,?)'
   ].join(' ')).run(titularId,contaId,agora);
   this.banco.exec('COMMIT');
   return {vinculoConfirmadoNoEnsaio:true,repetido:false,
    contasVinculadas:1,pagamentosReais:0,posicoesReais:0};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
}
module.exports={VinculosContasEscritorioCheckoutStagingSQLite};
