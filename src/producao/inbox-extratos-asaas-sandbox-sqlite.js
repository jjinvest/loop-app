'use strict';
// Guarda de extratos PSP somente SANDBOX. Consulta externa nao produz prova
// de titularidade, dinheiro disponivel, conciliacao bancaria ou autorizacao.
// A conta interna e apenas alias de finalidade, NAO identificacao bancária.
const {createHash}=require('node:crypto');
const {validarPeriodo}=require('./contrato-extratos-readonly');
const TABELAS_IMPORTACOES_EXTRATO_ENSAIO=Object.freeze([
 'loop_lab_tesouraria_lotes_extrato',
 'loop_lab_tesouraria_itens_extrato'
]);
const ID=/^[A-Za-z0-9_-]{5,120}$/;
const HEX=/^[0-9a-f]{64}$/;
const ALIASES=Object.freeze(['PAGADOR:ASAAS','PSP:ASAAS']);
const CLASSIFICACOES=Object.freeze([
 'SOMENTE_EXTRATO_SANDBOX','TIPO_NAO_CLASSIFICADO',
 'VALOR_INDETERMINADO'
]);
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const inteiro=n=>Number.isSafeInteger(n)&&Math.abs(n)<=1e12;
function validarLote({consultaId,contaAlias,relatorio}={}){
 if(!ID.test(consultaId||'')||!ALIASES.includes(contaAlias)||
    !relatorio||relatorio.origem!=='ASAAS_SANDBOX'||
    relatorio.paginasCompletas!==true||
    relatorio.metodo!=='GET_EXCLUSIVO_SANDBOX'||
    relatorio.credenciaisReaisAutenticadas!==false||
    relatorio.contaTitularComprovada!==false||
    relatorio.liquidacaoRealCertificada!==false||
    relatorio.permiteSaqueReal!==false||
    relatorio.permiteCreditoPosicao!==false||
    !relatorio.periodo||
    !Number.isSafeInteger(relatorio.paginas)||relatorio.paginas<1||
    !Number.isSafeInteger(relatorio.totalRegistros)||
    relatorio.totalRegistros<0||relatorio.totalRegistros>5000||
    !Array.isArray(relatorio.registros)||
    relatorio.registros.length!==relatorio.totalRegistros)
  falha('INBOX_EXTRATO_ENSAIO_LOTE_INVALIDO');
 validarPeriodo(relatorio.periodo);
 const ids=new Set();
 for(const r of relatorio.registros){
  if(!r||!ID.test(r.transacaoId||'')||ids.has(r.transacaoId)||
     typeof r.tipo!=='string'||
     !/^[A-Z][A-Z0-9_]{1,119}$/.test(r.tipo)||
     !CLASSIFICACOES.includes(r.classificacao)||
     !HEX.test(r.digest||'')||
     (r.centavosExatosInformados!==null&&
      !inteiro(r.centavosExatosInformados)))
   falha('INBOX_EXTRATO_ENSAIO_ITEM_INVALIDO');
  if(r.classificacao==='VALOR_INDETERMINADO'&&
     r.centavosExatosInformados!==null)
   falha('INBOX_EXTRATO_ENSAIO_ITEM_INVALIDO');
  ids.add(r.transacaoId);
 }
 return {
  consultaId,contaAlias,origem:relatorio.origem,
  inicio:relatorio.periodo.inicio,
  fim:relatorio.periodo.fim,
  paginas:relatorio.paginas,total:relatorio.totalRegistros,
  items:relatorio.registros.map(x=>({
   id:x.transacaoId,tipo:x.tipo,
   centavos:x.centavosExatosInformados,
   classe:x.classificacao,digest:x.digest
  }))
 };
}
function digestLote(dados){
 return sha([dados.consultaId,dados.contaAlias,dados.origem,
  dados.inicio,dados.fim,dados.paginas,dados.total,
  dados.items.map(x=>[
   x.id,x.tipo,x.centavos,x.classe,x.digest
  ])]);
}
class InboxExtratosAsaasSandboxSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(process.env.NODE_ENV==='production')
   falha('INBOX_EXTRATO_ENSAIO_PROIBIDO_PRODUCAO');
  if(typeof banco?.prepare!=='function'||
     typeof banco?.exec!=='function'||typeof agora!=='function'||
     !banco.prepare([
      'SELECT 1 FROM sqlite_master WHERE type=? AND name=?'
     ].join(' ')).get('table','loop_lab_tesouraria_movimentos'))
   falha('INBOX_EXTRATO_ENSAIO_SQLITE_INCOMPATIVEL');
  this.db=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_lotes_extrato(',
   'consulta_id TEXT PRIMARY KEY,conta_alias TEXT NOT NULL,',
   'origem TEXT NOT NULL,inicio TEXT NOT NULL,fim TEXT NOT NULL,',
   'paginas INTEGER NOT NULL,total INTEGER NOT NULL,',
   'digest TEXT NOT NULL,criado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_lab_tesouraria_itens_extrato(',
   'consulta_id TEXT NOT NULL REFERENCES',
   'loop_lab_tesouraria_lotes_extrato(consulta_id),',
   'transacao_id TEXT NOT NULL,tipo TEXT NOT NULL,',
   'centavos INTEGER,classificacao TEXT NOT NULL,digest TEXT NOT NULL,',
   'PRIMARY KEY(consulta_id,transacao_id));',
   ...TABELAS_IMPORTACOES_EXTRATO_ENSAIO.flatMap(t=>[
    'CREATE TRIGGER IF NOT EXISTS '+t+'_sem_update',
    'BEFORE UPDATE ON '+t+
     " BEGIN SELECT RAISE(ABORT,'INBOX_EXTRATO_IMUTAVEL'); END;",
    'CREATE TRIGGER IF NOT EXISTS '+t+'_sem_delete',
    'BEFORE DELETE ON '+t+
     " BEGIN SELECT RAISE(ABORT,'INBOX_EXTRATO_IMUTAVEL'); END;"
   ])
  ].join(' '));
  this.verificar();
 }
 _transacao(f){
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const r=f();this.verificar();this.db.exec('COMMIT');return r;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 _hora(){
  const n=this.agora();
  if(!Number.isSafeInteger(n)||n<=0)
   falha('INBOX_EXTRATO_ENSAIO_RELOGIO_INVALIDO');
  return n;
 }
 registrarLote(args){
  const lote=validarLote(args),digest=digestLote(lote);
  return this._transacao(()=>{
   const anterior=this.db.prepare([
    'SELECT digest FROM loop_lab_tesouraria_lotes_extrato',
    'WHERE consulta_id=?'
   ].join(' ')).get(lote.consultaId);
   if(anterior){
    if(anterior.digest!==digest)
     falha('INBOX_EXTRATO_ENSAIO_REPLAY_DIVERGENTE');
    return {registrado:false,repetido:true,
     registros:lote.total,financeiroReal:false};
   }
   // A mesma movimentacao pode aparecer em intervalos sobrepostos.
   // Se surgir com dados conflitantes, bloquear sem substituir registros.
   const conferir=this.db.prepare([
    'SELECT i.tipo,i.centavos,i.classificacao,i.digest',
    'FROM loop_lab_tesouraria_itens_extrato i',
    'JOIN loop_lab_tesouraria_lotes_extrato l',
    'ON l.consulta_id=i.consulta_id',
    'WHERE l.conta_alias=? AND i.transacao_id=? LIMIT 1'
   ].join(' '));
   for(const item of lote.items){
    const existente=conferir.get(lote.contaAlias,item.id);
    if(existente&&(
     existente.tipo!==item.tipo||
     existente.centavos!==item.centavos||
     existente.classificacao!==item.classe||
     existente.digest!==item.digest))
     falha('INBOX_EXTRATO_ENSAIO_MOVIMENTO_CONTRADITORIO');
   }
   this.db.prepare([
    'INSERT INTO loop_lab_tesouraria_lotes_extrato(',
    'consulta_id,conta_alias,origem,inicio,fim,paginas,total,digest,criado_em)',
    'VALUES(?,?,?,?,?,?,?,?,?)'
   ].join(' ')).run(lote.consultaId,lote.contaAlias,lote.origem,
    lote.inicio,lote.fim,lote.paginas,lote.total,digest,this._hora());
   const inserir=this.db.prepare([
    'INSERT INTO loop_lab_tesouraria_itens_extrato(',
    'consulta_id,transacao_id,tipo,centavos,classificacao,digest)',
    'VALUES(?,?,?,?,?,?)'
   ].join(' '));
   for(const item of lote.items)
    inserir.run(lote.consultaId,item.id,item.tipo,
     item.centavos,item.classe,item.digest);
   return {registrado:true,repetido:false,
    registros:lote.total,contaSomenteAlias:lote.contaAlias,
    liquidacaoRealComprovada:false,
    conciliacaoBancariaReal:false,
    dinheiroRealMovimentado:false};
  });
 }
 verificar(){
  const db=this.db;
  let lotes=0,registros=0,quarentena=0;
  for(const l of db.prepare(
   'SELECT * FROM loop_lab_tesouraria_lotes_extrato ORDER BY consulta_id'
  ).iterate()){
   lotes++;
   const itens=db.prepare([
    'SELECT * FROM loop_lab_tesouraria_itens_extrato',
    'WHERE consulta_id=? ORDER BY rowid'
   ].join(' ')).all(l.consulta_id);
   const normalized=validarLote({
    consultaId:l.consulta_id,contaAlias:l.conta_alias,
    relatorio:{
     origem:l.origem,
     periodo:{inicio:l.inicio,fim:l.fim},
     paginas:l.paginas,totalRegistros:l.total,
     paginasCompletas:true,metodo:'GET_EXCLUSIVO_SANDBOX',
     credenciaisReaisAutenticadas:false,
     contaTitularComprovada:false,
     liquidacaoRealCertificada:false,
     permiteSaqueReal:false,permiteCreditoPosicao:false,
     registros:itens.map(x=>({
      transacaoId:x.transacao_id,tipo:x.tipo,
      centavosExatosInformados:x.centavos,
      classificacao:x.classificacao,digest:x.digest
     }))
    }
   });
   if(l.digest!==digestLote(normalized)||
      !Number.isSafeInteger(l.criado_em)||l.criado_em<=0)
    falha('INBOX_EXTRATO_ENSAIO_HISTORICO_ADULTERADO');
   registros+=itens.length;
   quarentena+=itens.filter(x=>
    x.classificacao!=='SOMENTE_EXTRATO_SANDBOX').length;
  }
  const orfaos=db.prepare([
   'SELECT COUNT(*) AS n FROM loop_lab_tesouraria_itens_extrato i',
   'LEFT JOIN loop_lab_tesouraria_lotes_extrato l',
   'ON l.consulta_id=i.consulta_id',
   'WHERE l.consulta_id IS NULL'
  ].join(' ')).get().n;
  if(orfaos)falha('INBOX_EXTRATO_ENSAIO_ITENS_ORFAOS');
  return {integridade:'OK',lotes,registros,
   registrosEmQuarentena:quarentena,
   origemExternaRealComprovada:false,financeiroReal:false};
 }
}
async function consultarEArquivarExtratoAsaasSandbox({
 adaptador,inbox,consultaId,contaAlias,inicio,fim,limite,maxPaginas
}={}){
 if(!adaptador||typeof adaptador.consultarExtratoPaginado!=='function'||
    !inbox||typeof inbox.registrarLote!=='function')
  falha('INBOX_EXTRATO_ENSAIO_ADAPTADOR_INVALIDO');
 const relatorio=await adaptador.consultarExtratoPaginado({
  inicio,fim,limite,maxPaginas
 });
 return inbox.registrarLote({consultaId,contaAlias,relatorio});
}
module.exports={InboxExtratosAsaasSandboxSQLite,
 TABELAS_IMPORTACOES_EXTRATO_ENSAIO,consultarEArquivarExtratoAsaasSandbox};
