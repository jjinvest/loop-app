'use strict';
// Inventário exclusivamente de leitura do acervo REAL AKITEMM/LOOP.
// Nunca expõe nomes, IDs, fotos, CPF, segredos ou os bytes das imagens.
// Não substitui cópia offsite nem comprovação de restauração do banco de mídia.
const {createHash}=require('node:crypto');
const TIPOS=new Set(['image/jpeg','image/png','image/webp']);
function falha(c){const e=Error(c);e.codigo=c;throw e;}
function numero(banco,tabela){
 return banco.prepare('SELECT COUNT(*) AS n FROM '+tabela).get().n;
}
function checar(banco){
 return banco.prepare('PRAGMA quick_check').get().quick_check==='ok';
}
function auditarAcervoReal({bancoIdentidade,bancoMidia=null,limiteFotos=64}={}){
 if(typeof bancoIdentidade?.prepare!=='function'||
    (bancoMidia!==null&&typeof bancoMidia?.prepare!=='function')||
    bancoMidia===bancoIdentidade||
    !Number.isSafeInteger(limiteFotos)||limiteFotos<1||limiteFotos>256)
  falha('ACERVO_REAL_CONFIGURACAO_INVALIDA');
 const sqliteIdentidade=checar(bancoIdentidade);
 const contas=numero(bancoIdentidade,'loop_real_contas');
 const vinculos=numero(bancoIdentidade,'loop_real_vinculos_indicacao');
 const produtosPrincipais=numero(bancoIdentidade,'loja_real_produtos');
 const quadradinhos=numero(bancoIdentidade,'loja_real_vitrine_posicoes');
 if(!bancoMidia)return Object.freeze({
  estado:sqliteIdentidade?'MIDIA_NAO_MONTADA':'IDENTIDADE_INTEGRA_NAO_COMPROVADA',
  contas,vinculos,produtosPrincipais,quadradinhos,
  fotosAtuais:0,fotosVerificadas:0,fotosPendentes:0,
  integridadeIdentidade:sqliteIdentidade,integridadeMidia:false,
  backupMidiaOffsiteComprovado:false
 });
 const sqliteMidia=checar(bancoMidia);
 const produtosMidia=numero(bancoMidia,'catalogo_produtos');
 const fotosAtuais=numero(bancoMidia,'akitemm_fotos_produto_atuais_lab');
 const fotosHistoricas=numero(bancoMidia,'akitemm_fotos_produto_versoes_lab');
 const fotosSemVersao=bancoMidia.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_fotos_produto_atuais_lab a',
  'LEFT JOIN akitemm_fotos_produto_versoes_lab v',
  'ON v.produto_id=a.produto_id AND v.posicao=a.posicao AND',
  'v.versao=a.versao WHERE v.produto_id IS NULL'
 ].join(' ')).get().n;
 const idsPrincipais=new Set(bancoIdentidade.prepare(
  'SELECT produto_id FROM loja_real_produtos').all().map(r=>r.produto_id));
 const idsMidia=new Set(bancoMidia.prepare(
  'SELECT id FROM catalogo_produtos').all().map(r=>r.id));
 const idsSlots=bancoIdentidade.prepare(
  'SELECT produto_id FROM loja_real_vitrine_posicoes').all();
 let conflitos=0,slotsOrfaos=0,fotosOrfas=0,fotosInvalidas=0,fotosVerificadas=0;
 for(const id of idsMidia)if(idsPrincipais.has(id))conflitos++;
 for(const row of idsSlots){
  if(!idsPrincipais.has(row.produto_id)&&!idsMidia.has(row.produto_id))
   slotsOrfaos++;
 }
 const sql=[
  'SELECT a.produto_id,a.posicao,v.sha256,v.mime,v.bytes,v.conteudo',
  'FROM akitemm_fotos_produto_atuais_lab a',
  'JOIN akitemm_fotos_produto_versoes_lab v',
  'ON v.produto_id=a.produto_id AND v.posicao=a.posicao AND',
  'v.versao=a.versao ORDER BY a.produto_id,a.posicao LIMIT ?'
 ].join(' ');
 for(const foto of bancoMidia.prepare(sql).iterate(limiteFotos)){
  fotosVerificadas++;
  if(!idsMidia.has(foto.produto_id)&&
     !idsPrincipais.has(foto.produto_id))fotosOrfas++;
  if(!Buffer.isBuffer(foto.conteudo)||
     !Number.isSafeInteger(foto.bytes)||
     foto.bytes!==foto.conteudo.length||
     !TIPOS.has(foto.mime)||
     typeof foto.sha256!=='string'||
     createHash('sha256').update(foto.conteudo).digest('hex')!==foto.sha256)
   fotosInvalidas++;
 }
 const fotosPendentes=Math.max(0,fotosAtuais-fotosVerificadas);
 const inconsistente=!sqliteIdentidade||!sqliteMidia||fotosSemVersao>0||
  conflitos>0||slotsOrfaos>0||fotosInvalidas>0||fotosOrfas>0||
  quadradinhos>400||fotosHistoricas<fotosAtuais;
 return Object.freeze({
  estado:inconsistente?'INCONSISTENTE':
   fotosPendentes>0?'VERIFICACAO_PARCIAL':'DADOS_CONFERIDOS_SEM_BACKUP_MIDIA',
  contas,vinculos,produtosPrincipais,produtosMidia,quadradinhos,
  fotosAtuais,fotosHistoricas,fotosVerificadas,fotosPendentes,
  fotosSemVersao,fotosInvalidas,fotosOrfas,slotsOrfaos,
  idsDuplicadosEntreCatalogos:conflitos,
  integridadeIdentidade:sqliteIdentidade,integridadeMidia:sqliteMidia,
  backupMidiaOffsiteComprovado:false
 });
}
module.exports={auditarAcervoReal};
