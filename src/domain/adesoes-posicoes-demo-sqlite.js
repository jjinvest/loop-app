'use strict';

// Prototipo LOCAL: usar somente numeros ficticios de teste; nao coletar CPF real.
const {randomBytes,createHmac}=require('node:crypto');
const VERSAO_TERMOS_DEMO='LOOP-DEMO-V1';
function falhar(codigo){const erro=new Error(codigo);erro.codigo=codigo;return erro;}
function cpfFicticioValido(valor){
 if(typeof valor!=='string'||!/^\d{11}$/.test(valor)||/^(\d)\1{10}$/.test(valor))return false;
 const digito=(quantidade)=>{
  const soma=Array.from({length:quantidade},(_,i)=>Number(valor[i])*(quantidade+1-i))
   .reduce((a,b)=>a+b,0);
  const resto=(soma*10)%11;
  return (resto===10?0:resto)===Number(valor[quantidade]);
 };
 return digito(9)&&digito(10);
}
class AdesoesPosicoesDemoSQLite{
 constructor({ponte,banco=ponte?.banco,relogio=()=>new Date().toISOString()}={}){
  if(!ponte||!banco||ponte.banco!==banco||typeof ponte._restaurar!=='function')
   throw new TypeError('Ponte e SQLite compartilhados obrigatorios');
  this.ponte=ponte;this.banco=banco;this.relogio=relogio;
  banco.exec(`
   CREATE TABLE IF NOT EXISTS admin_loop_chave_cpf_demo(
    id INTEGER PRIMARY KEY CHECK(id=1),chave_hex TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS admin_loop_adesoes_contas_demo(
    conta_id TEXT PRIMARY KEY REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,
    cpf_digest TEXT NOT NULL UNIQUE,
    termos_versao TEXT NOT NULL,
    aceito_em TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS admin_loop_adesoes_posicoes_demo(
    posicao_id INTEGER PRIMARY KEY CHECK(posicao_id>0),
    conta_id TEXT NOT NULL REFERENCES admin_loop_adesoes_contas_demo(conta_id) ON DELETE RESTRICT,
    ativada_em TEXT NOT NULL
   );
   CREATE TRIGGER IF NOT EXISTS admin_loop_adesoes_contas_no_update
    BEFORE UPDATE ON admin_loop_adesoes_contas_demo
    BEGIN SELECT RAISE(ABORT,'aceite de teste imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_loop_adesoes_contas_no_delete
    BEFORE DELETE ON admin_loop_adesoes_contas_demo
    BEGIN SELECT RAISE(ABORT,'aceite de teste imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_loop_adesoes_posicoes_no_update
    BEFORE UPDATE ON admin_loop_adesoes_posicoes_demo
    BEGIN SELECT RAISE(ABORT,'ativacao de teste imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_loop_adesoes_posicoes_no_delete
    BEFORE DELETE ON admin_loop_adesoes_posicoes_demo
    BEGIN SELECT RAISE(ABORT,'ativacao de teste imutavel'); END;
  `);
  // O gatilho so pode ser instalado apos criacao da tabela de adesoes.
  // Instalacao tardia impede falhas de schema em migracoes de carrinho/loja.
  banco.exec(`
   CREATE TRIGGER IF NOT EXISTS admin_loop_vinculos_indicacao_posicao_validar_insert
    BEFORE INSERT ON admin_loop_vinculos_indicacao_posicao_demo
   BEGIN
    SELECT CASE WHEN NEW.convidado_id=NEW.indicador_id OR NOT EXISTS(
     SELECT 1 FROM admin_ponte_convites_validados_demo v
     WHERE v.convidado_id=NEW.convidado_id
       AND v.indicador_id=NEW.indicador_id
    ) THEN RAISE(ABORT,'INDICACAO_TITULAR_DIVERGENTE') END;
    SELECT CASE WHEN NOT EXISTS(
     SELECT 1 FROM admin_loop_adesoes_posicoes_demo p
     WHERE p.posicao_id=NEW.posicao_indicador_id
       AND p.conta_id=NEW.indicador_id
    ) THEN RAISE(ABORT,'INDICACAO_POSICAO_NAO_ATIVA') END;
    SELECT CASE WHEN NOT EXISTS(
     SELECT 1 FROM admin_loop_adesoes_posicoes_demo p
     WHERE p.conta_id=NEW.convidado_id
    ) THEN RAISE(ABORT,'INDICADO_NAO_ATIVO') END;
    SELECT CASE WHEN EXISTS(
     SELECT 1 FROM admin_ponte_convites_aplicados_demo a
     WHERE a.convidado_id=NEW.convidado_id
    ) THEN RAISE(ABORT,'INDICACAO_JA_APLICADA') END;
   END;
  `);
  banco.prepare('INSERT OR IGNORE INTO admin_loop_chave_cpf_demo(id,chave_hex) VALUES(1,?)')
   .run(randomBytes(32).toString('hex'));
 }
 consultarConta(contaId){
  const linha=this.banco.prepare(
   'SELECT conta_id,termos_versao,aceito_em FROM admin_loop_adesoes_contas_demo WHERE conta_id=?'
  ).get(contaId);
  return {cpfConfirmadoNoTeste:!!linha,versaoTermos:VERSAO_TERMOS_DEMO,
   termosVersaoAceita:linha?.termos_versao||null,
   aceiteRegistradoEm:linha?.aceito_em||null,
   termosReaisAprovados:false,cpfRealArmazenado:false};
 }
 ativar({contaId,cpfFicticio,aceitaTermos,versaoTermos,posicaoId}={}){
  if(typeof contaId!=='string'||!/^[a-f0-9-]{36}$/.test(contaId))
   throw falhar('CONTA_INVALIDA');
  const individual=this.ponte.atribuicaoManualPorPosicao===true;
  if(individual&&(!Number.isSafeInteger(posicaoId)||posicaoId<1))
   throw falhar('POSICAO_INVALIDA');
  if(!individual&&(aceitaTermos!==true||versaoTermos!==VERSAO_TERMOS_DEMO))
   throw falhar('ACEITE_TERMOS_OBRIGATORIO');
  if(!individual&&!cpfFicticioValido(cpfFicticio))
   throw falhar('CPF_FICTICIO_INVALIDO');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const conf=this.banco.prepare(
    'SELECT id FROM admin_contas_participantes_demo WHERE id=?'
   ).get(contaId);
   if(!conf)throw falhar('CONTA_INVALIDA');
   // O aceite deve ser possivel apos a primeira compra, mesmo sem cadeira.
   if(!this.ponte.linksComissoes.ativado(contaId))throw falhar('COMPRA_INICIAL_OBRIGATORIA');
   const sim=this.ponte._restaurar();
   const pendentes=[...sim.filas.filaA,...sim.filas.filaB].filter(p=>
    p.participanteId===contaId&&p.statusAdesao==='PENDENTE'&&
    (!individual||p.id===posicaoId)
   );
   if(individual&&!pendentes.length)throw falhar('POSICAO_NAO_PENDENTE');
   // Uma adesao anterior permanece valida; nao registrar novo aceite duplicado.
   const chave=this.banco.prepare('SELECT chave_hex FROM admin_loop_chave_cpf_demo WHERE id=1').get().chave_hex;
   const existente=this.banco.prepare(
    'SELECT cpf_digest FROM admin_loop_adesoes_contas_demo WHERE conta_id=?'
   ).get(contaId);
   if(!existente){
    if(aceitaTermos!==true||versaoTermos!==VERSAO_TERMOS_DEMO)
     throw falhar('ACEITE_TERMOS_OBRIGATORIO');
    if(!cpfFicticioValido(cpfFicticio))throw falhar('CPF_FICTICIO_INVALIDO');
   }
   if(existente&&!individual&&!cpfFicticioValido(cpfFicticio))
    throw falhar('CPF_FICTICIO_INVALIDO');
   const digest=existente&&individual?existente.cpf_digest:
    createHmac('sha256',Buffer.from(chave,'hex')).update(cpfFicticio).digest('hex');
   if(existente&&existente.cpf_digest!==digest)throw falhar('CPF_JA_FIXADO_NA_CONTA');
   if(existente&&!pendentes.length)throw falhar('ADESAO_JA_REALIZADA');
   const conflito=this.banco.prepare(
    'SELECT conta_id FROM admin_loop_adesoes_contas_demo WHERE cpf_digest=?'
   ).get(digest);
   if(conflito&&conflito.conta_id!==contaId)throw falhar('CPF_JA_ASSOCIADO');
   const data=this.relogio();
   if(!existente)this.banco.prepare(
    'INSERT INTO admin_loop_adesoes_contas_demo(conta_id,cpf_digest,termos_versao,aceito_em) VALUES(?,?,?,?)'
   ).run(contaId,digest,VERSAO_TERMOS_DEMO,data);
   const ids=[];
   for(const p of pendentes){
    p.statusAdesao='ATIVA';p.ativadaEm=data;
    this.banco.prepare(
     'INSERT INTO admin_loop_adesoes_posicoes_demo(posicao_id,conta_id,ativada_em) VALUES(?,?,?)'
    ).run(p.id,contaId,data);
    ids.push(p.id);
   }
   for(const p of sim.filas.vendasRegistradas.values()){
    if(ids.includes(p.id)){p.statusAdesao='ATIVA';p.ativadaEm=data;}
   }
   // Azul nao gera desconto/comissao. Somente o clique individual com CPF
   // torna verde e libera a reserva ficticia, atomicamente e uma unica vez.
   const bonificacoes=[];
   for(const id of ids){
    const gerada=this.ponte.bonificarPosicaoConfirmada({
     contaId,posicaoId:id,quando:data,simulador:sim
    });
    if(gerada)bonificacoes.push({posicaoId:id,...gerada});
   }
   this.banco.prepare(`
    INSERT INTO admin_ponte_estado_demo(id,snapshot_json) VALUES(1,?)
    ON CONFLICT(id) DO UPDATE SET snapshot_json=excluded.snapshot_json
   `).run(JSON.stringify(sim.exportarSnapshot()));
   this.banco.exec('COMMIT');
   return {ativadas:ids.length,posicoesIds:ids,bonificacoes,
    adesaoComissoesAtivada:true,termosVersao:VERSAO_TERMOS_DEMO,cpfConfirmadoNoTeste:true,
    cpfRealArmazenado:false,semPagamentoReal:true};
  }catch(erro){this.banco.exec('ROLLBACK');throw erro;}
 }
}
module.exports={AdesoesPosicoesDemoSQLite,VERSAO_TERMOS_DEMO,cpfFicticioValido};
