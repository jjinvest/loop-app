'use strict';

// Cadastro e conferência de senha somente para o laboratorio LOCAL.
// Nao criar conta real, sessao publica, CPF, indicacao valida ou posicao.
const {randomBytes,randomUUID,scryptSync,timingSafeEqual}=require('node:crypto');
const CODIGO=/^lp-[a-f0-9]{20}$/;
function falha(codigo,mensagem){
 const erro=new Error(mensagem);erro.codigo=codigo;return erro;
}
function nomeLogin(nome){
 if(typeof nome!=='string')throw falha('INVALIDO','Nome de usuario invalido');
 const limpo=nome.normalize('NFKC').trim().replace(/\s+/g,' ');
 if(limpo.length<3||limpo.length>60||
    !/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'-]*$/u.test(limpo)){
  throw falha('INVALIDO','Nome deve ter entre 3 e 60 caracteres validos');
 }
 return {nome:limpo,login:limpo.toLocaleLowerCase('pt-BR')};
}
function emailNormalizado(email){
 if(typeof email!=='string'||email.length>254||
    !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/.test(email.trim())){
  throw falha('INVALIDO','Email de teste invalido');
 }
 return email.trim().toLowerCase();
}
// Cadastro inicial: telefone brasileiro opcional somente para legado
// das simulacoes ja existentes. Interface nova o exige no navegador.
function telefoneNormalizado(telefone){
 if(telefone===undefined||telefone===null||telefone==='')return null;
 if(typeof telefone!=='string'||telefone.length>32||
  !/^[+() .0-9-]+$/.test(telefone)){
  throw falha('INVALIDO','Telefone de teste invalido');
 }
 let digitos=telefone.replace(/\D/g,'');
 if(digitos.length===12||digitos.length===13){
  if(!digitos.startsWith('55'))throw falha('INVALIDO','Use telefone brasileiro');
  digitos=digitos.slice(2);
 }
 if(!/^\d{10,11}$/.test(digitos))throw falha('INVALIDO','Telefone brasileiro deve ter DDD');
 const ddd=Number(digitos.slice(0,2));
 if(ddd<11||ddd>99)throw falha('INVALIDO','DDD invalido');
 const numero=digitos.slice(2);
 if((numero.length===9&&!numero.startsWith('9'))||
  (numero.length===8&&!/^[2-5]/.test(numero))||
  /^([0-9])\1+$/.test(numero)){
  throw falha('INVALIDO','Numero de telefone invalido');
 }
 return '+55'+digitos;
}
function senhaValida(senha){
 if(typeof senha!=='string'||senha.length<10||senha.length>128||
    /[\u0000-\u001f\u007f]/.test(senha)){
  throw falha('INVALIDO','Senha de teste deve ter de 10 a 128 caracteres');
 }
 return senha;
}
function idSeguro(id){
 if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw falha('INVALIDO','ID invalido');
 return id;
}
function contaExterna(linha){
 if(!linha)return null;
 return {
  contaId:linha.id,nome:linha.nome,login:linha.login,
  codigoConvite:linha.codigo_convite,
  indicadoPorId:linha.indicado_por_id,
  criadoEm:linha.criado_em,
  telefoneInformadoNoTeste:Boolean(linha.tem_telefone),
  cadastroConfirmadoNoTeste:true,
  compraConfirmada:false,indicacaoValida:false,
  fila:'NAO_INTEGRADA',posicoesCriadas:0,
  cpfColetado:false,clienteReal:false
 };
}
class ContasParticipantesDemoSQLite{
 constructor({banco}={}){
  if(!banco||typeof banco.prepare!=='function')throw new TypeError('SQLite de laboratorio obrigatorio');
  this.banco=banco;
  banco.exec(`
   CREATE TABLE IF NOT EXISTS admin_contas_participantes_demo(
    id TEXT PRIMARY KEY NOT NULL,
    nome TEXT NOT NULL,
    login TEXT NOT NULL UNIQUE,
    email_normalizado TEXT NOT NULL UNIQUE,
    salt_hex TEXT NOT NULL,
    senha_hash_hex TEXT NOT NULL,
    codigo_convite TEXT NOT NULL UNIQUE,
    indicado_por_id TEXT REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    criado_em TEXT NOT NULL,
    CHECK(id<>indicado_por_id)
   );
   CREATE TABLE IF NOT EXISTS admin_contas_telefones_demo(
    conta_id TEXT PRIMARY KEY NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    telefone_normalizado TEXT NOT NULL UNIQUE,
    CHECK(length(telefone_normalizado) IN (13,14))
   );
   CREATE TRIGGER IF NOT EXISTS admin_contas_telefones_no_update
    BEFORE UPDATE ON admin_contas_telefones_demo
    BEGIN SELECT RAISE(ABORT,'telefone demo imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_contas_telefones_no_delete
    BEFORE DELETE ON admin_contas_telefones_demo
    BEGIN SELECT RAISE(ABORT,'telefone demo imutavel'); END;
   CREATE INDEX IF NOT EXISTS idx_contas_demo_indicador
    ON admin_contas_participantes_demo(indicado_por_id);
   CREATE TABLE IF NOT EXISTS admin_contas_eventos_demo(
    sequencia INTEGER PRIMARY KEY AUTOINCREMENT,
    conta_id TEXT NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    tipo TEXT NOT NULL CHECK(tipo='CADASTRO_FICTICIO'),
    registrado_em TEXT NOT NULL
   );
   CREATE TRIGGER IF NOT EXISTS admin_contas_eventos_no_update
    BEFORE UPDATE ON admin_contas_eventos_demo
    BEGIN SELECT RAISE(ABORT,'cadastro demo imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_contas_eventos_no_delete
    BEFORE DELETE ON admin_contas_eventos_demo
    BEGIN SELECT RAISE(ABORT,'cadastro demo imutavel'); END;
  `);
  this.hashFalso=scryptSync('senha-inexistente-no-laboratorio',
    Buffer.from('00000000000000000000000000000000','hex'),64);
 }
 cadastrar({nome,email,telefone,senha,codigoIndicador=null}={}){
  const dados=nomeLogin(nome),emailLimpo=emailNormalizado(email);
  const telefoneLimpo=telefoneNormalizado(telefone);
  senhaValida(senha);
  if(codigoIndicador!==null&&(typeof codigoIndicador!=='string'||!CODIGO.test(codigoIndicador))){
   throw falha('INVALIDO','Codigo de convite invalido');
  }
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   if(this.banco.prepare('SELECT 1 FROM admin_contas_participantes_demo WHERE login=?').get(dados.login)){
    throw falha('CONFLITO','Nome de acesso ja cadastrado no teste');
   }
   if(this.banco.prepare('SELECT 1 FROM admin_contas_participantes_demo WHERE email_normalizado=?').get(emailLimpo)){
    throw falha('CONFLITO','Email de teste ja cadastrado');
   }
   if(telefoneLimpo&&this.banco.prepare(
    'SELECT 1 FROM admin_contas_telefones_demo WHERE telefone_normalizado=?'
   ).get(telefoneLimpo))throw falha('CONFLITO','Telefone de teste ja cadastrado');
   let indicador=null;
   if(codigoIndicador!==null){
    indicador=this.banco.prepare('SELECT id FROM admin_contas_participantes_demo WHERE codigo_convite=?').get(codigoIndicador);
    if(!indicador)throw falha('CONVITE_INVALIDO','Codigo de convite nao encontrado');
   }
   const contaId=randomUUID(),codigoConvite='lp-'+randomBytes(10).toString('hex');
   const salt=randomBytes(16).toString('hex');
   const hash=scryptSync(senha,Buffer.from(salt,'hex'),64).toString('hex');
   const data=new Date().toISOString();
   this.banco.prepare(`
    INSERT INTO admin_contas_participantes_demo
    (id,nome,login,email_normalizado,salt_hex,senha_hash_hex,
     codigo_convite,indicado_por_id,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?)
   `).run(contaId,dados.nome,dados.login,emailLimpo,salt,hash,
    codigoConvite,indicador?.id||null,data);
   if(telefoneLimpo)this.banco.prepare(
    'INSERT INTO admin_contas_telefones_demo(conta_id,telefone_normalizado) VALUES (?,?)'
   ).run(contaId,telefoneLimpo);
   this.banco.prepare(`
    INSERT INTO admin_contas_eventos_demo(conta_id,tipo,registrado_em)
    VALUES (?,'CADASTRO_FICTICIO',?)
   `).run(contaId,data);
   this.banco.exec('COMMIT');
   return this.buscar(contaId);
  }catch(erro){this.banco.exec('ROLLBACK');throw erro;}
 }
 buscar(contaId){
  const linha=this.banco.prepare(
   'SELECT c.*,CASE WHEN t.conta_id IS NULL THEN 0 ELSE 1 END AS tem_telefone FROM admin_contas_participantes_demo c LEFT JOIN admin_contas_telefones_demo t ON t.conta_id=c.id WHERE c.id=?'
  ).get(idSeguro(contaId));
  return contaExterna(linha);
 }
 alterarSenha({contaId,senhaAtual,novaSenha}={}){
  const id=idSeguro(contaId);
  senhaValida(senhaAtual);senhaValida(novaSenha);
  const linha=this.banco.prepare('SELECT salt_hex,senha_hash_hex FROM admin_contas_participantes_demo WHERE id=?').get(id);
  if(!linha)throw falha('CREDENCIAIS_INVALIDAS','Senha atual incorreta');
  const salAnterior=Buffer.from(linha.salt_hex,'hex');
  const esperado=Buffer.from(linha.senha_hash_hex,'hex');
  const recebido=scryptSync(senhaAtual,salAnterior,64);
  if(esperado.length!==recebido.length||!timingSafeEqual(esperado,recebido))
   throw falha('CREDENCIAIS_INVALIDAS','Senha atual incorreta');
  if(timingSafeEqual(esperado,scryptSync(novaSenha,salAnterior,64)))
   throw falha('SENHA_REPETIDA','Escolha uma senha diferente da atual');
  const salNovo=randomBytes(16).toString('hex');
  const hashNovo=scryptSync(novaSenha,Buffer.from(salNovo,'hex'),64).toString('hex');
  const gravou=this.banco.prepare(
   'UPDATE admin_contas_participantes_demo SET salt_hex=?,senha_hash_hex=? WHERE id=? AND senha_hash_hex=?'
  ).run(salNovo,hashNovo,id,linha.senha_hash_hex);
  if(gravou.changes!==1)throw falha('CONFLITO_SENHA','A senha foi alterada em outra sessão');
  return {senhaAlterada:true};
 }
 autenticar({nome,senha}={}){
  const dados=nomeLogin(nome);
  senhaValida(senha);
  const linha=this.banco.prepare(
   'SELECT c.*,CASE WHEN t.conta_id IS NULL THEN 0 ELSE 1 END AS tem_telefone FROM admin_contas_participantes_demo c LEFT JOIN admin_contas_telefones_demo t ON t.conta_id=c.id WHERE c.login=?'
  ).get(dados.login);
  const recebido=scryptSync(senha,linha?Buffer.from(linha.salt_hex,'hex'):
   Buffer.from('00000000000000000000000000000000','hex'),64);
  const esperado=linha?Buffer.from(linha.senha_hash_hex,'hex'):this.hashFalso;
  if(!linha||esperado.length!==recebido.length||!timingSafeEqual(esperado,recebido)){
   throw falha('CREDENCIAIS_INVALIDAS','Credenciais de teste invalidas');
  }
  return {senhaConferidaNoTeste:true,sessaoDeClienteReal:false,conta:contaExterna(linha)};
 }
 consultarConvite(codigo){
  if(typeof codigo!=='string'||!CODIGO.test(codigo))throw falha('INVALIDO','Codigo de convite invalido');
  const linha=this.banco.prepare(
   'SELECT id,nome,codigo_convite FROM admin_contas_participantes_demo WHERE codigo_convite=?'
  ).get(codigo);
  if(!linha)return null;
  return {codigoConvite:linha.codigo_convite,indicador:{contaId:linha.id,nome:linha.nome},
   cadastroPorConvitePossivelNoTeste:true,indicacaoValida:false};
 }
 listar(){
  const contas=this.banco.prepare(
   'SELECT c.*,CASE WHEN t.conta_id IS NULL THEN 0 ELSE 1 END AS tem_telefone FROM admin_contas_participantes_demo c LEFT JOIN admin_contas_telefones_demo t ON t.conta_id=c.id ORDER BY c.criado_em,c.id'
  ).all();
  const pendentes=new Map();
  for(const c of contas){
   if(c.indicado_por_id)pendentes.set(c.indicado_por_id,(pendentes.get(c.indicado_por_id)||0)+1);
  }
  return {
   modo:'CONTAS_FICTICIAS_RESTRITAS_AO_ADMIN_LOCAL',
   semClientesReais:true,semCPF:true,semCompraReal:true,
   indicacoesValidadas:0,movimentacaoFilas:false,
   contas:contas.map(c=>({...contaExterna(c),convitesPendentes:pendentes.get(c.id)||0}))
  };
 }
 historico(contaId){
  idSeguro(contaId);
  const conta=this.buscar(contaId);
  if(!conta)return null;
  return {
   contaId,
   eventos:this.banco.prepare(`
    SELECT sequencia,tipo,registrado_em AS registradoEm
    FROM admin_contas_eventos_demo WHERE conta_id=? ORDER BY sequencia
   `).all(contaId),
   aceiteDeTermosJuridicos:false,compraReal:false,indicacaoValidada:false
  };
 }
}
module.exports={ContasParticipantesDemoSQLite,telefoneNormalizado};
