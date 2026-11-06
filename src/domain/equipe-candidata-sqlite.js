'use strict';
// Vinculo de CADASTRO de laboratorio: nao prova compra, indicacao qualificada
// ou comissao. Nunca alimentar fila comercial ou extrato financeiro a partir daqui.
const NICK=/^[A-Za-z]{1,9}$/;
class EquipeCandidataSQLite{
 constructor({banco}={}){
  if(!banco||typeof banco.prepare!=='function')throw new TypeError('SQLite obrigatorio');
  this.banco=banco;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_convites_candidatos_lab(',
   'indicado_id TEXT PRIMARY KEY NOT NULL',
   ' REFERENCES akitemm_conta_unica_candidata(id) ON DELETE RESTRICT,',
   'indicador_id TEXT NOT NULL',
   ' REFERENCES akitemm_conta_unica_candidata(id) ON DELETE RESTRICT,',
   'criado_em INTEGER NOT NULL CHECK(criado_em>0),',
   'CHECK(indicado_id<>indicador_id));',
   'CREATE INDEX IF NOT EXISTS idx_convites_lab_indicador',
   'ON akitemm_convites_candidatos_lab(indicador_id,criado_em DESC);',
   'CREATE TRIGGER IF NOT EXISTS convites_lab_imutaveis',
   'BEFORE UPDATE ON akitemm_convites_candidatos_lab',
   "BEGIN SELECT RAISE(ABORT,'indicacao de ensaio imutavel'); END;"
  ].join(' '));
 }
 existeNick(nick){
  return typeof nick==='string'&&NICK.test(nick)&&Boolean(this.banco.prepare(
   'SELECT 1 FROM akitemm_conta_unica_candidata WHERE nick=? COLLATE NOCASE'
  ).get(nick));
 }
 registrarCadastro({indicadoId,indicadorNick}={}){
  if(typeof indicadoId!=='string'||!/^titular-[a-f0-9-]{36}$/.test(indicadoId)||
     !this.existeNick(indicadorNick))return {registrado:false};
  const indicador=this.banco.prepare(
   'SELECT id FROM akitemm_conta_unica_candidata WHERE nick=? COLLATE NOCASE'
  ).get(indicadorNick);
  if(indicador.id===indicadoId)return {registrado:false};
  const r=this.banco.prepare([
   'INSERT INTO akitemm_convites_candidatos_lab',
   '(indicado_id,indicador_id,criado_em) VALUES(?,?,?)',
   'ON CONFLICT(indicado_id) DO NOTHING'
  ].join(' ')).run(indicadoId,indicador.id,Date.now());
  return {registrado:r.changes===1};
 }
 listar({titularId,pagina=0}={}){
  if(typeof titularId!=='string'||!/^titular-[a-f0-9-]{36}$/.test(titularId))
   throw new TypeError('Titular invalido');
  if(!Number.isSafeInteger(pagina)||pagina<0||pagina>10000)
   throw new RangeError('Pagina invalida');
  const total=this.banco.prepare(
   'SELECT COUNT(*) AS total FROM akitemm_convites_candidatos_lab WHERE indicador_id=?'
  ).get(titularId).total;
  // A equipe fica no mesmo SQLite do motor, sem duplicar criterio de
  // validacao PSP: o LEDGER imutavel e a unica fonte da atribuicao.
  const tabela=nome=>Boolean(this.banco.prepare([
   "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
  ].join(' ')).get(nome));
  const temAtribuicoes=tabela('akitemm_motor_indicacoes_qualificadas_lab');
  const temLotes=tabela('akitemm_motor_ensaio_lotes_pedido');
  const linhas=this.banco.prepare([
   'SELECT i.indicado_id AS indicadoId,c.nick AS nick,',
   'i.criado_em AS registradoEm,',
   ...(temAtribuicoes?[
    'q.posicao_alvo_id AS posicaoAlvoId,',
    'CASE WHEN q.indicado_id IS NULL THEN 0 ELSE 1 END AS qualificadaEnsaio'
   ]:[
    'NULL AS posicaoAlvoId,0 AS qualificadaEnsaio'
   ]),
   ...(temLotes?[
    ',CASE WHEN EXISTS(',
    'SELECT 1 FROM akitemm_motor_ensaio_lotes_pedido l',
    'WHERE l.titular_id=i.indicado_id)',
    'THEN 1 ELSE 0 END AS possuiPosicaoDeEnsaio'
   ]:[',0 AS possuiPosicaoDeEnsaio']),
   'FROM akitemm_convites_candidatos_lab i',
   'JOIN akitemm_conta_unica_candidata c ON c.id=i.indicado_id',
   ...(temAtribuicoes?[
    'LEFT JOIN akitemm_motor_indicacoes_qualificadas_lab q',
    'ON q.indicado_id=i.indicado_id AND q.indicador_id=i.indicador_id'
   ]:[]),
   'WHERE i.indicador_id=?',
   'ORDER BY i.criado_em DESC,i.indicado_id DESC LIMIT 20 OFFSET ?'
  ].join(' ')).all(titularId,pagina*20).map(x=>({
   indicadoId:x.indicadoId,nick:x.nick,registradoEm:x.registradoEm,
   posicaoAlvoId:x.posicaoAlvoId,
   qualificadaEnsaio:x.qualificadaEnsaio===1,
   possuiPosicaoDeEnsaio:x.possuiPosicaoDeEnsaio===1
  }));
  const qualificadas=temAtribuicoes?this.banco.prepare([
   'SELECT COUNT(*) AS n FROM akitemm_motor_indicacoes_qualificadas_lab',
   'WHERE indicador_id=?'
  ].join(' ')).get(titularId).n:0;
  return {total,pagina,proximaPagina:(pagina+1)*20<total?pagina+1:null,
   cadastros:linhas,indicacoesQualificadas:qualificadas,
   bonificacoesReais:0,pagamentosReais:0,somenteEnsaio:true};
 }
}
module.exports={EquipeCandidataSQLite};
