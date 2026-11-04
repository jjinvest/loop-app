'use strict';
// Ponte SOMENTE LEITURA entre posições fictícias oriundas de PSP reconsultado
// e o simulador de filas. Nunca registra evento no motor comercial.
// Usa a fotografia histórica, mas a fila continua hipotética e não ativa direitos.
const {MotorFilas}=require('./motor-filas');
const {LIMITE_POSICOES_ATIVAS}=require('./capacidade-posicoes-loop');
const {consultarPedido}=require('./relatorio-homologacao-checkout-staging');
const MAX_LEITURA=1000;
const TITULAR=/^[A-Za-z0-9_-]{6,80}$/;
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
class ProjecaoFilasCandidatoSandbox{
 constructor({banco,posicoes,sinalizacao=null,preAdesao=null}={}){
  if(process.env.NODE_ENV==='production')erro('PROJECAO_FILAS_PROIBIDA_PRODUCAO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
   erro('BANCO_SQLITE_OBRIGATORIO');
  if(posicoes!==null&&posicoes!==undefined&&
     (posicoes.banco!==banco||typeof posicoes.consultar!=='function'))
   erro('PONTE_SANDBOX_INCOMPATIVEL');
  if(posicoes&&
    (sinalizacao?.db!==banco||
     typeof sinalizacao?.consultarFotografiaPrepedido!=='function'))
   erro('FOTOGRAFIA_HISTORICA_OBRIGATORIA');
  if(preAdesao!==null&&
     (preAdesao.db!==banco||typeof preAdesao.buscarLinha!=='function'))
   erro('PRE_ADESAO_FONTE_DIVERGENTE');
  this.banco=banco;this.posicoes=posicoes||null;
  this.sinalizacao=sinalizacao;this.preAdesao=preAdesao;
 }
 consultar({titularId=null}={}){
  if(process.env.NODE_ENV==='production')erro('PROJECAO_FILAS_PROIBIDA_PRODUCAO');
  if(titularId!==null&&(typeof titularId!=='string'||!TITULAR.test(titularId)))
   erro('TITULAR_INVALIDO');
  const padrao={
   modo:'PROJECAO_HIPOTETICA_FILAS_SANDBOX_SOMENTE_LEITURA',
   fonte:'POSICOES_PENDENTES_PSP_RECONSULTADAS_SQLITE',
   regraFilaSimulada:'3A:1B',limiteAtivasPorTitular:LIMITE_POSICOES_ATIVAS,
   classificacaoHistoricaComprovada:false,
   habilitacaoMotorReal:false,ativacaoAdesao:false,
   filaRealAlterada:false,tabuleiroRealAlterado:false,
   posicoesReaisCriadas:0,saquesReais:0,bonusGerados:0,
   dinheiroReal:false,consultaPSPExecutada:false
  };
  if(!this.posicoes)return {...padrao,
   estado:'SEM_PROJECAO_PSP_SANDBOX',
   totalHistorico:0,pendentesConferidas:0,
   hipoteseFilaB:[],pendentesExigemRevisao:0,
   pendentesAcimaCapacidade:0,prontasParaMotorReal:0,
   motivo:'Projeção de posições fictícias indisponível; nenhum PSP foi consultado.'};
  // Isolar ANTES de contar/ler: dados de outras contas nao podem consumir
  // o limite nem derrubar a consulta de uma sessao com poucos registros.
  const filtro=titularId===null?'':' WHERE titular_id=?';
  const parametros=titularId===null?[]:[titularId];
  const linhas=this.banco.prepare([
   'SELECT prepedido_id AS prepedidoId,titular_id AS titularId,',
   'id AS id,criado_em AS criadoEm',
   'FROM akitemm_prepedido_posicoes_pendentes_sandbox_staging'+filtro,
   'ORDER BY criado_em ASC,prepedido_id ASC LIMIT ?'
  ].join(' ')).all(...parametros,MAX_LEITURA+1);
  // Uma leitura limitada elimina a janela COUNT -> SELECT para outro
  // escritor e nunca materializa toda a tabela antes de aplicar o teto.
  const n=linhas.length;
  if(n>MAX_LEITURA)erro('MAXIMO_ANALISE_SEGURA_EXCEDIDO');
  const motor=new MotorFilas({relogio:()=>'2026-11-04T00:00:00.000Z'});
  const contagem=new Map(),pendencias=[];
  let emRevisao=0,acima=0,naHipotese=0,semFoto=0,semOferta=0;
  for(const linha of linhas){
   // Exige identidade, valor integral e GET PSP independentemente conferido.
   // Nunca toma um webhook bruto como evidência.
   const registro=consultarPedido({banco:this.banco,
    prepedidoId:linha.prepedidoId,titularId:linha.titularId});
   const pendente=this.posicoes.consultar({
    titularId:linha.titularId,prepedidoId:linha.prepedidoId
   });
   const valido=Boolean(registro&&
    registro.valorCentavos===25000&&
    registro.posicoesFicticiasAptasAgora===1&&
    registro.conferenciaPSPConcluida===true&&
    registro.exigeRevisaoManual!==true&&
    pendente?.estado==='PENDENTE_DE_CONFIRMACAO_CLIENTE_SANDBOX');
   const preAdesaoRegistrada=!!this.preAdesao?.buscarLinha(linha.prepedidoId,linha.titularId);
   const foto=this.sinalizacao.consultarFotografiaPrepedido({
    prepedidoId:linha.prepedidoId,titularId:linha.titularId});
   let estado,ordemHipotetica=null;
   if(!valido){estado='EXIGE_REVISAO_PSP';emRevisao++;}
   else if(!foto){estado='SEM_FOTOGRAFIA_HISTORICA';semFoto++;}
   else if(foto.totalCentavos!==25000||!foto.podeSimularFilaBAzul){
    estado='OFERTA_HISTORICA_NAO_QUALIFICADA';semOferta++;
   }else{
    const contador=contagem.get(linha.titularId)||0;
    if(contador>=LIMITE_POSICOES_ATIVAS){
     estado='ACIMA_DEZ_APENAS_PARA_PLANEJAMENTO';acima++;
    }else{
     const r=motor.registrarPosicao({
      nome:'Titular de ensaio',participanteId:linha.titularId,
      vendaId:linha.prepedidoId,adesaoPendente:true
     });
     if(r.repetida)erro('PROJECAO_DUPLICADA');
     ordemHipotetica=r.posicao.id;estado='APENAS_PREVIA_FILA_B_AZUL';
     contagem.set(linha.titularId,contador+1);
     naHipotese++;
    }
   }
   // Nunca devolver titulares de terceiros ao cliente autenticado.
   if(titularId===null||linha.titularId===titularId)
    pendencias.push({
     id:linha.id,prepedidoId:linha.prepedidoId,
     ...(titularId===null?{titularId:linha.titularId}:{}),
     estado,ordemHipotetica,cpfETermosHomologados:false,
     historicoDaClassificacaoComprovado:Boolean(foto),
     preAdesaoFicticiaRegistrada:preAdesaoRegistrada
    });
  }
  if(titularId!==null){
   const minhas=pendencias.filter(p=>p.estado==='APENAS_PREVIA_FILA_B_AZUL');
   return {...padrao,estado:'PREVIA_DO_TITULAR_SEM_DIREITOS',
    escopoOrdemHipotetica:'SOMENTE_TITULAR_NAO_E_ORDEM_GLOBAL',
    pendencias,meusPendentesHistoricos:pendencias.length,
    hipoteseFilaB:minhas,meusSimuladosNaFilaB:minhas.length,
    prontasParaMotorReal:0,outrasContasOmitidas:true,
    motivo:'Nenhuma posição foi ativada. Falta conciliação, adesão e comprovação histórica da oferta para o motor real.'};
  }
  const resumo=motor.resumo();
  // O MotorFilas foi usado APENAS em memória e não registra suas posições
  // em dados compartilhados. Nunca iniciar TabuleiroLoop.
  return {...padrao,estado:'SOMENTE_CENARIO_NAO_ATIVADO',
   totalHistorico:n,pendentesConferidas:naHipotese,
   pendentesExigemRevisao:emRevisao,pendentesAcimaCapacidade:acima,
   pendentesSemFotografia:semFoto,pendentesSemOfertaQualificada:semOferta,
   quantidadeSimuladaFilaA:resumo.A.quantidade,
   quantidadeSimuladaFilaB:resumo.B.quantidade,
   hipoteseFilaB:pendencias,prontasParaMotorReal:0,
   movimentoCatracaExecutado:false,
   motivo:'Cenário hipotético montado em memória com conferência da classificação histórica. Ainda sem CPF/termos homologados, lançamento real ou giro.'};
 }
}
module.exports={ProjecaoFilasCandidatoSandbox,MAX_LEITURA};
