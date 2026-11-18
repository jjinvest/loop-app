'use strict';
// Inventario de custodia: LEITURA EXCLUSIVA. Nao apaga nem bloqueia contas.
// A legitimidade vem do titular do projeto; a origem SQLite nao a determina.
const COLUNAS_DE_IDENTIDADE=new Set([
 'titular_id','titularid','indicado_id','indicador_id','conta_id',
 'cliente_id','participante_id','proprietario_id','beneficiario_id',
 'comprador_id','usuario_id','titular_origem_id','titular_destino_id'
]);
function erro(codigo){const e=Error(codigo);e.codigo=codigo;throw e;}
function sqlNome(nome){
 if(typeof nome!=='string'||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nome))
  erro('AUDITORIA_ESQUEMA_NAO_IDENTIFICADO');
 return '"'+nome+'"';
}
function auditarContasMigradasReadOnly({banco,
 nicksReconhecidos=['VILELA','Taisaassi'],limiteContas=1000}={}){
 if(typeof banco?.prepare!=='function'||
    !Array.isArray(nicksReconhecidos)||nicksReconhecidos.length!==2||
    nicksReconhecidos.some(n=>typeof n!=='string'||!/^[A-Za-z]{1,12}$/.test(n))||
    nicksReconhecidos[0].toLowerCase()===nicksReconhecidos[1].toLowerCase())
  erro('AUDITORIA_CONFIGURACAO_INVALIDA');
 if(!Number.isSafeInteger(limiteContas)||limiteContas<2||limiteContas>100000)
  erro('AUDITORIA_LIMITE_INVALIDO');
 const tabelas=new Set(banco.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
 ).all().map(x=>x.name));
 for(const nome of ['loop_real_contas','loop_real_migracoes_preview',
  'loop_real_vinculos_indicacao'])
  if(!tabelas.has(nome))erro('AUDITORIA_TABELAS_DE_IDENTIDADE_AUSENTES');
 const total=banco.prepare('SELECT COUNT(*) AS n FROM loop_real_contas').get().n;
 if(!Number.isSafeInteger(total)||total>limiteContas)
  erro('AUDITORIA_VOLUME_REQUER_PAGINACAO');
 const contas=banco.prepare('SELECT id,nick FROM loop_real_contas').all();
 if(contas.length!==total||
    contas.some(x=>typeof x.id!=='string'||typeof x.nick!=='string'))
  erro('AUDITORIA_CONTAS_INCONSISTENTES');
 const aprovados=new Set(nicksReconhecidos.map(n=>n.toLowerCase()));
 const reconhecidas=contas.filter(x=>aprovados.has(x.nick.toLowerCase()));
 const IDsReconhecidos=new Set(reconhecidas.map(x=>x.id));
 const adicionais=contas.filter(x=>!IDsReconhecidos.has(x.id));
 const idsAdicionais=adicionais.map(x=>x.id);
 const migradas=new Set(banco.prepare(
  'SELECT titular_id FROM loop_real_migracoes_preview'
 ).all().map(x=>x.titular_id));
 const adicionaisMigradas=idsAdicionais.filter(id=>migradas.has(id)).length;
 const nicksPresentes=new Set(reconhecidas.map(x=>x.nick.toLowerCase()));
 const duasReconhecidas=nicksPresentes.size===2&&reconhecidas.length===2;
 const raiz=contas.find(x=>x.nick.toLowerCase()===
  nicksReconhecidos[0].toLowerCase());
 const primeiro=contas.find(x=>x.nick.toLowerCase()===
  nicksReconhecidos[1].toLowerCase());
 const indicadorDaPrimeira=primeiro?banco.prepare(
  'SELECT indicador_id FROM loop_real_vinculos_indicacao WHERE indicado_id=?'
 ).get(primeiro.id)?.indicador_id:null;
 const primeiroVinculoConferido=Boolean(raiz&&primeiro&&
  indicadorDaPrimeira===raiz.id);
 const referencias=[];
 const placeholders=idsAdicionais.map(()=>'?').join(',');
 // Descobre dependencias antes de propor exclusao, inclusive quando
 // o FK da tabela aponta a vinculos de indicacao e nao diretamente a contas.
 if(idsAdicionais.length){
  for(const tabela of tabelas){
   if(tabela==='loop_real_contas')continue;
   const nomeTabela=sqlNome(tabela);
   const info=banco.prepare('PRAGMA table_info('+nomeTabela+')').all();
   const fks=banco.prepare('PRAGMA foreign_key_list('+nomeTabela+')').all();
   const colunas=new Set(fks.filter(fk=>
    fk.table==='loop_real_contas'||
    fk.table==='loop_real_vinculos_indicacao').map(fk=>fk.from));
   for(const col of info)
    if(COLUNAS_DE_IDENTIDADE.has(col.name.toLowerCase()))
     colunas.add(col.name);
   for(const coluna of colunas){
    const qtd=banco.prepare('SELECT COUNT(*) AS n FROM '+nomeTabela+
     ' WHERE '+sqlNome(coluna)+' IN ('+placeholders+')').get(...idsAdicionais).n;
    if(qtd>0)referencias.push({
     tabela,coluna,quantidade:qtd
    });
   }
  }
 }
 const problemasFk=banco.prepare('PRAGMA foreign_key_check').all().length;
 const dadosInesperados=adicionais.length-adicionaisMigradas;
 const todosMigrados=adicionais.length===adicionaisMigradas;
 return Object.freeze({
  estado:!duasReconhecidas||!primeiroVinculoConferido?
   'IDENTIDADE_ORIGINAL_NAO_COMPROVADA':
   adicionais.length?'CONTAS_ADICIONAIS_EXIGEM_CONCILIACAO':
   'SOMENTE_IDENTIDADES_RECONHECIDAS',
  totalContas:total,
  reconhecidas:reconhecidas.length,
  duasReconhecidas,
  primeiroVinculoConferido,
  adicionais:adicionais.length,
  adicionaisComOrigemDeMigracao:adicionaisMigradas,
  adicionaisSemProvaDeMigracao:dadosInesperados,
  todasAdicionaisRegistradasNaMigracao:todosMigrados,
  referencias,
  quantidadeColunasComReferencias:referencias.length,
  integridadeChavesEstrangeiras:problemasFk===0?'OK':'DIVERGENTE',
  exclusaoExecutada:false,
  exclusaoAutomaticaPermitida:false,
  observacao:'Inventario sem nomes, nicks adicionais, emails, senhas ou IDs em log; nenhuma exclusao realizada.'
 });
}
module.exports={auditarContasMigradasReadOnly};
