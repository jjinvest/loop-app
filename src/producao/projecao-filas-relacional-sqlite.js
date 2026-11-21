'use strict';
// Espelho RELACIONAL de leitura da ordem atual do motor LOOP.
// Nunca e fonte de verdade, nao registra compra, ganho, pagamento ou giro.
// Atualizado na MESMA transacao do snapshot, com falha fechada na divergencia.
const {createHash}=require('node:crypto');
const {SimuladorLoop}=require('../domain/simulador-loop');
const {lerEstadoMotor}=require('./estado-motor-unificado-sqlite');
const {HistoricoCiclosRelacionalSQLite}=
 require('./historico-ciclos-relacional-sqlite');
const TABELAS_PROJECAO=Object.freeze([
 'loop_real_filas_projecao_meta',
 'loop_real_filas_projecao_posicoes'
]);
const SELECT_POSICOES=[
 'SELECT posicao_id,participante_id,empresa,fila,local,ordem,',
 'status_adesao,indicacoes_vinculadas',
 'FROM loop_real_filas_projecao_posicoes ORDER BY posicao_id'
].join(' ');
const SHA=/^[a-f0-9]{64}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function digest(s){return createHash('sha256').update(s).digest('hex');}
function posicionamento(sim){
 if(!sim?.filas||!sim?.tabuleiro)falha('FILA_PROJECAO_ESTADO_INVALIDO');
 const linhas=[],vistos=new Set();
 const adicionar=(p,local,ordem)=>{
  if(!p)return;
  if(!Number.isSafeInteger(p.id)||p.id<=0||vistos.has(p.id)||
     !['A','B'].includes(p.fila)||
     typeof p.participanteId!=='string'||!p.participanteId.length)
   falha('FILA_PROJECAO_POSICAO_INVALIDA');
  const empresa=p.empresa===true?1:0;
  const indicacoes=p.indicacoesVinculadas||0;
  if(!Number.isSafeInteger(indicacoes)||indicacoes<0||
     (local==='A'||local==='B')!==Number.isSafeInteger(ordem))
   falha('FILA_PROJECAO_ORDEM_INVALIDA');
  vistos.add(p.id);
  linhas.push({
   posicao_id:p.id,participante_id:p.participanteId,
   empresa,fila:p.fila,local,ordem,
   status_adesao:p.statusAdesao||null,
   indicacoes_vinculadas:indicacoes
  });
 };
 sim.filas.filaA.forEach((p,i)=>adicionar(p,'A',i+1));
 sim.filas.filaB.forEach((p,i)=>adicionar(p,'B',i+1));
 adicionar(sim.tabuleiro.centro,'CENTRO',null);
 if(!Array.isArray(sim.tabuleiro.vagas)||sim.tabuleiro.vagas.length!==6)
  falha('FILA_PROJECAO_TABULEIRO_INVALIDO');
 sim.tabuleiro.vagas.forEach((p,i)=>adicionar(p,'VAGA_'+(i+1),null));
 return linhas.sort((a,b)=>a.posicao_id-b.posicao_id);
}
function igual(a,b){
 return a.posicao_id===b.posicao_id&&
  a.participante_id===b.participante_id&&
  a.empresa===b.empresa&&a.fila===b.fila&&
  a.local===b.local&&a.ordem===b.ordem&&
  a.status_adesao===b.status_adesao&&
  a.indicacoes_vinculadas===b.indicacoes_vinculadas;
}
function fonte(banco){
 const x=lerEstadoMotor(banco);
 const raw=x?.persistido||'';
 const sim=x?SimuladorLoop.restaurarSnapshot(JSON.parse(x.snapshot)):
  new SimuladorLoop();
 return {raw,revisao:x?.revisao||0,sim};
}
class ProjecaoFilasRelacionalSQLite{
 constructor({banco}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
   falha('FILA_PROJECAO_BANCO_INVALIDO');
  this.db=banco;
  const presentes=TABELAS_PROJECAO.filter(t=>banco.prepare(
   "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
  ).get(t));
  if(presentes.length>0&&presentes.length!==TABELAS_PROJECAO.length)
   falha('FILA_PROJECAO_ESQUEMA_PARCIAL');
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_filas_projecao_meta(',
   'id INTEGER PRIMARY KEY CHECK(id=1),',
   'versao INTEGER NOT NULL CHECK(versao=1),',
   'revisao INTEGER NOT NULL CHECK(revisao>=0),',
   'snapshot_sha256 TEXT NOT NULL,',
   'total_posicoes INTEGER NOT NULL CHECK(total_posicoes>=0));',
   'CREATE TABLE IF NOT EXISTS loop_real_filas_projecao_posicoes(',
   'posicao_id INTEGER PRIMARY KEY CHECK(posicao_id>0),',
   'participante_id TEXT NOT NULL,',
   'empresa INTEGER NOT NULL CHECK(empresa IN (0,1)),',
   "fila TEXT NOT NULL CHECK(fila IN ('A','B')),",
   "local TEXT NOT NULL CHECK(local IN ('A','B','CENTRO',",
   "'VAGA_1','VAGA_2','VAGA_3','VAGA_4','VAGA_5','VAGA_6')),",
   'ordem INTEGER,',
   'status_adesao TEXT,',
   'indicacoes_vinculadas INTEGER NOT NULL CHECK(indicacoes_vinculadas>=0),',
   "CHECK((local IN ('A','B') AND ordem>0) OR",
   "(local NOT IN ('A','B') AND ordem IS NULL)));",
   'CREATE UNIQUE INDEX IF NOT EXISTS idx_loop_projecao_fila_ordem',
   'ON loop_real_filas_projecao_posicoes(local,ordem);',
   'CREATE INDEX IF NOT EXISTS idx_loop_projecao_titular',
   'ON loop_real_filas_projecao_posicoes(participante_id,local,ordem);'
  ].join(' '));
  this.historico=new HistoricoCiclosRelacionalSQLite({banco});
 }
 _meta(){return this.db.prepare(
  'SELECT * FROM loop_real_filas_projecao_meta WHERE id=1'
 ).get();}
 // Compativeis com backups antigos sem espelho: a primeira carga e aditiva.
 // Se o espelho ja existe e diverge, nunca reconstroi silenciosamente.
 inicializar(){
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const atual=fonte(this.db),meta=this._meta();
   this.historico.inicializarEmTransacao({sim:atual.sim});
   if(!meta){
    const sobra=this.db.prepare(
     'SELECT 1 FROM loop_real_filas_projecao_posicoes LIMIT 1'
    ).get();
    if(sobra)falha('FILA_PROJECAO_SEM_METADADOS');
    this._gravar(atual, null);
   }else this.conferir(atual);
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 _gravar({raw,revisao,sim},versaoAnterior){
  if(!this.db.isTransaction)falha('FILA_PROJECAO_TRANSACAO_OBRIGATORIA');
  const rows=posicionamento(sim);
  const antigos=new Map(this.db.prepare(SELECT_POSICOES)
   .all().map(r=>[r.posicao_id,r]));
  // Remover primeiro TODAS as linhas alteradas evita conflito de UNIQUE
  // quando dois titulares trocam ordem na mesma fila. Tudo transacional.
  const novas=[],excluir=[];
  for(const row of rows){
   const antiga=antigos.get(row.posicao_id);
   if(!antiga||!igual(antiga,row)){
    if(antiga)excluir.push(row.posicao_id);
    novas.push(row);
   }
   antigos.delete(row.posicao_id);
  }
  for(const id of antigos.keys())excluir.push(id);
  const remover=this.db.prepare(
   'DELETE FROM loop_real_filas_projecao_posicoes WHERE posicao_id=?'
  );
  for(const id of excluir)remover.run(id);
  const colocar=this.db.prepare([
   'INSERT INTO loop_real_filas_projecao_posicoes(',
   'posicao_id,participante_id,empresa,fila,local,ordem,',
   'status_adesao,indicacoes_vinculadas) VALUES(?,?,?,?,?,?,?,?)'
  ].join(' '));
  for(const row of novas)colocar.run(
   row.posicao_id,row.participante_id,row.empresa,row.fila,row.local,
   row.ordem,row.status_adesao,row.indicacoes_vinculadas
  );
  if(versaoAnterior===null){
   this.db.prepare([
    'INSERT INTO loop_real_filas_projecao_meta',
    '(id,versao,revisao,snapshot_sha256,total_posicoes)',
    'VALUES(1,1,?,?,?)'
   ].join(' ')).run(revisao,digest(raw),rows.length);
  }else{
   const r=this.db.prepare([
    'UPDATE loop_real_filas_projecao_meta',
    'SET revisao=?,snapshot_sha256=?,total_posicoes=?',
    'WHERE id=1 AND revisao=?'
   ].join(' ')).run(revisao,digest(raw),rows.length,versaoAnterior);
   if(r.changes!==1)falha('FILA_PROJECAO_REVISAO_CONCORRENTE');
  }
  // A mesma transação preserva histórico já concluído sem reescrevê-lo.
  this.historico?.sincronizarEmTransacao({sim});
 }
 atualizarEmTransacao({revisaoAnterior,revisao,snapshot,sim}={}){
  if(!this.db.isTransaction||!Number.isSafeInteger(revisaoAnterior)||
     !Number.isSafeInteger(revisao)||revisao!==revisaoAnterior+1||
     typeof snapshot!=='string'||!sim)
   falha('FILA_PROJECAO_ATUALIZACAO_INVALIDA');
  if(this._meta()?.revisao!==revisaoAnterior)
   falha('FILA_PROJECAO_REVISAO_DIVERGENTE');
  this._gravar({raw:snapshot,revisao,sim},revisaoAnterior);
 }
 conferir({raw,revisao,sim}=fonte(this.db)){
  const meta=this._meta(),esperadas=posicionamento(sim);
  if(!meta||meta.versao!==1||meta.revisao!==revisao||
     typeof meta.snapshot_sha256!=='string'||
     !SHA.test(meta.snapshot_sha256)||
     meta.snapshot_sha256!==digest(raw)||
     meta.total_posicoes!==esperadas.length)
   falha('FILA_PROJECAO_METADATA_DIVERGENTE');
  let i=0;
  for(const row of this.db.prepare(SELECT_POSICOES).iterate()){
   if(i>=esperadas.length||!igual(row,esperadas[i++]))
    falha('FILA_PROJECAO_POSICOES_DIVERGENTES');
  }
  if(i!==esperadas.length)falha('FILA_PROJECAO_POSICOES_DIVERGENTES');
  this.historico?.conferirRapido({sim});
  return {integridade:'OK',revisao,totalPosicoes:esperadas.length,
   somenteLeitura:true,financeiroReal:false};
 }
 consultarFila({fila,offset=0,limite=30}={}){
  if(!['A','B'].includes(fila)||!Number.isSafeInteger(offset)||
     offset<0||!Number.isSafeInteger(limite)||limite<1||limite>30)
   falha('FILA_PROJECAO_PAGINACAO_INVALIDA');
  const rows=this.db.prepare([
   'SELECT posicao_id AS numero,participante_id AS participanteId,',
   'ordem,empresa,indicacoes_vinculadas AS indicacoesVinculadas',
   'FROM loop_real_filas_projecao_posicoes',
   'WHERE local=? ORDER BY ordem LIMIT ? OFFSET ?'
  ].join(' ')).all(fila,limite,offset);
  return {fila,offset,itens:rows,
   total:this.db.prepare(
    'SELECT COUNT(*) AS n FROM loop_real_filas_projecao_posicoes WHERE local=?'
   ).get(fila).n,
   fonte:'PROJECAO_RELACIONAL_SOMENTE_LEITURA',financeiroReal:false};
 }
 // Aplicado por todos os módulos que escrevem o snapshot diretamente,
 // sempre ANTES do COMMIT, para não publicar um espelho defasado.
 static sincronizarMutacaoEmTransacao(banco){
  if(!banco?.isTransaction)
   falha('FILA_PROJECAO_TRANSACAO_OBRIGATORIA');
  const presentes=TABELAS_PROJECAO.filter(t=>banco.prepare(
   "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
  ).get(t));
  if(!presentes.length)return {legado:true};
  if(presentes.length!==TABELAS_PROJECAO.length)
   falha('FILA_PROJECAO_ESQUEMA_PARCIAL');
  const espelho=Object.create(ProjecaoFilasRelacionalSQLite.prototype);
  espelho.db=banco;
  espelho.historico=HistoricoCiclosRelacionalSQLite.referenciaExistente(banco);
  const atual=fonte(banco),meta=espelho._meta();
  if(!meta)falha('FILA_PROJECAO_SEM_METADADOS');
  if(meta.revisao===atual.revisao)return espelho.conferir(atual);
  if(meta.revisao+1!==atual.revisao)
   falha('FILA_PROJECAO_REVISAO_DIVERGENTE');
  espelho.atualizarEmTransacao({
   revisaoAnterior:meta.revisao,revisao:atual.revisao,
   snapshot:atual.raw,sim:atual.sim
  });
  return espelho.conferir(atual);
 }
 static verificarExistente({banco}={}){
  const presentes=TABELAS_PROJECAO.filter(t=>banco.prepare(
   "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
  ).get(t));
  if(!presentes.length)return {legado:true};
  if(presentes.length!==TABELAS_PROJECAO.length)
   falha('FILA_PROJECAO_ESQUEMA_PARCIAL');
  const espelho=Object.create(ProjecaoFilasRelacionalSQLite.prototype);
  espelho.db=banco;
  espelho.historico=HistoricoCiclosRelacionalSQLite.referenciaExistente(banco);
  return espelho.conferir(fonte(banco));
 }
}
module.exports={ProjecaoFilasRelacionalSQLite,TABELAS_PROJECAO};
