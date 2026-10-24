'use strict';

// Registro de seguranca EXCLUSIVO do escritorio ficticio LOCAL.
// Nao grava senhas, nomes, emails, IPs, cookies nem tokens.
const TIPOS=Object.freeze([
 'LOGIN_SUCESSO','LOGIN_INVALIDO','LOGIN_BLOQUEADO',
 'SESSAO_REVOGADA','SESSAO_ENCERRADA'
]);
const TIPOS_SET=new Set(TIPOS);
function validarData(valor){
 if(typeof valor!=='string'||!Number.isFinite(Date.parse(valor))||
  new Date(valor).toISOString()!==valor){
  throw new TypeError('Data de auditoria de teste invalida');
 }
 return valor;
}
class AuditoriaAcessoParticipanteDemoSQLite{
 constructor({banco}={}){
  if(!banco||typeof banco.prepare!=='function'){
   throw new TypeError('Banco SQLite local obrigatorio para auditoria');
  }
  this.banco=banco;
  banco.exec(`
   CREATE TABLE IF NOT EXISTS admin_acessos_participante_demo(
    sequencia INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK(tipo IN (
     'LOGIN_SUCESSO','LOGIN_INVALIDO','LOGIN_BLOQUEADO',
     'SESSAO_REVOGADA','SESSAO_ENCERRADA')),
    conta_id TEXT REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    registrado_em TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_admin_acesso_conta_demo
    ON admin_acessos_participante_demo(conta_id,sequencia);
   CREATE TRIGGER IF NOT EXISTS admin_acessos_demo_imutavel_update
    BEFORE UPDATE ON admin_acessos_participante_demo
    BEGIN SELECT RAISE(ABORT,'auditoria de acesso ficticia imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_acessos_demo_imutavel_delete
    BEFORE DELETE ON admin_acessos_participante_demo
    BEGIN SELECT RAISE(ABORT,'auditoria de acesso ficticia imutavel'); END;
  `);
 }
 registrar({tipo,contaId=null,registradoEm=new Date().toISOString()}={}){
  if(!TIPOS_SET.has(tipo))throw new TypeError('Tipo de auditoria invalido');
  if(contaId!==null&&(typeof contaId!=='string'||!/^[a-f0-9-]{36}$/.test(contaId))){
   throw new TypeError('Conta auditada invalida');
  }
  if((tipo==='LOGIN_SUCESSO'||tipo==='SESSAO_REVOGADA'||
    tipo==='SESSAO_ENCERRADA')&&!contaId){
   throw new TypeError('Evento autenticado exige conta existente');
  }
  validarData(registradoEm);
  const inserido=this.banco.prepare(`
   INSERT INTO admin_acessos_participante_demo(tipo,conta_id,registrado_em)
   VALUES (?,?,?)
  `).run(tipo,contaId,registradoEm);
  return {sequencia:Number(inserido.lastInsertRowid),tipo,registradoEm};
 }
 consultar({limite=50}={}){
  if(!Number.isSafeInteger(limite)||limite<1||limite>100){
   throw new TypeError('Limite de consulta invalido');
  }
  const eventos=this.banco.prepare(`
   SELECT sequencia,tipo,registrado_em AS registradoEm
   FROM admin_acessos_participante_demo
   ORDER BY sequencia DESC LIMIT ?
  `).all(limite);
  const contadores=this.banco.prepare(`
   SELECT tipo,COUNT(*) AS quantidade FROM admin_acessos_participante_demo
   GROUP BY tipo
  `).all();
  return {
   modo:'AUDITORIA_ACESSOS_FICTICIOS_LOCAL',
   semIdentificacaoDeUsuariosNoRelatorio:true,
   semIPSemSenhaSemToken:true,
   quantidades:Object.fromEntries(TIPOS.map(tipo=>[tipo,Number(
    contadores.find(c=>c.tipo===tipo)?.quantidade||0
   )])),
   eventos
  };
 }
}
module.exports={AuditoriaAcessoParticipanteDemoSQLite,TIPOS};
