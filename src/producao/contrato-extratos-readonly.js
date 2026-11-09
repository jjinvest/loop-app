'use strict';
// Contrato comum somente de LEITURA para extratos de prestadores independentes.
// Nao infere deposito real de extrato sandbox ou fixture. Nunca cria saldo.
// Os adaptadores Inter/MP precisam de seus respectivos produtos e credenciais.
const {createHash}=require('node:crypto');
const TIPOS_RECONHECIDOS=new Set([
 'PAYMENT_RECEIVED','PAYMENT_FEE','PAYMENT_REVERSAL',
 'TRANSFER','TRANSFER_FEE','PIX_TRANSACTION_CREDIT',
 'PIX_TRANSACTION_CREDIT_REFUND','PIX_TRANSACTION_DEBIT_REFUND',
 'INTERNAL_TRANSFER_CREDIT','INTERNAL_TRANSFER_DEBIT'
]);
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
const idOk=x=>(typeof x==='string'&&/^[A-Za-z0-9_-]{1,130}$/.test(x))||
 (Number.isSafeInteger(x)&&x>=0);
const centavosExatos=x=>{
 if(typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1e10)
  return null;
 const c=Math.round(x*100);
 return Number.isSafeInteger(c)&&Math.abs(x*100-c)<1e-6?c:null;
};
const assinatura=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function dataISO(s){
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))
  erro('EXTRATO_DATA_INVALIDA');
 const d=new Date(s+'T00:00:00Z');
 if(!Number.isFinite(d.getTime())||
    d.toISOString().slice(0,10)!==s)
  erro('EXTRATO_DATA_INVALIDA');
 return d.getTime();
}
function validarPeriodo({inicio,fim}={}){
 const a=dataISO(inicio),b=dataISO(fim);
 if(b<a||b-a>90*86400000)erro('EXTRATO_PERIODO_INVALIDO');
 return Object.freeze({inicio,fim});
}
function fontesCandidatasExtrato(){
 return Object.freeze({
  INTER:Object.freeze({
   tipo:'API_BANKING_EMPRESAS',
   autenticacao:'OAUTH_E_CERTIFICADO_PENDENTES',
   exportacaoExtratoContratada:false,
   dadosDeContaRealDisponiveis:false
  }),
  MERCADO_PAGO:Object.freeze({
   tipo:'RELATORIO_ACCOUNT_MONEY',
   autenticacao:'TOKEN_DE_CONTA_PENDENTE',
   relatorioGeradoEValidado:false,
   // Geracao do relatorio pode exigir POST, nao equivale a Pix-out.
   apenasGetSuficiente:false,dadosDeContaRealDisponiveis:false
  }),
  ASAAS:Object.freeze({
   tipo:'API_EXTRATO_PAGINADA',
   consultaSandboxImplementada:true,
   contaRealHomologada:false,extratoRealCertificado:false
  }),
  CELCOIN:Object.freeze({
   tipo:'PRODUTO_BAAS_A_CONFIRMAR',
   consultaExtratoHabilitada:false,
   contaRealHomologada:false
  })
 });
}
async function coletarExtratoReadOnly({
 origem,consultarPagina,inicio,fim,limite=50,maxPaginas=10
}={}){
 if(process.env.NODE_ENV==='production')
  erro('EXTRATO_SANDBOX_PROIBIDO_PRODUCAO');
 if(origem!=='ASAAS_SANDBOX'||typeof consultarPagina!=='function'||
    !Number.isSafeInteger(limite)||limite<1||limite>100||
    !Number.isSafeInteger(maxPaginas)||maxPaginas<1||maxPaginas>50)
  erro('EXTRATO_CONTRATO_INVALIDO');
 validarPeriodo({inicio,fim});
 const vistos=new Set(),registros=[];
 let paginas=0,totalEsperado=null;
 for(let pag=0;pag<maxPaginas;pag++){
  const offset=pag*limite;
  if(!Number.isSafeInteger(offset))
   erro('EXTRATO_OFFSET_INVALIDO');
  // Qualquer timeout/401/JSON invalido aborta TODO o lote; nada parcial.
  const resposta=await consultarPagina({offset,limite,inicio,fim});
  if(!resposta||!Array.isArray(resposta.data)||
     typeof resposta.hasMore!=='boolean'||
     resposta.data.length>limite||
     (resposta.hasMore&&resposta.data.length===0)||
     (resposta.totalCount!==undefined&&
      (!Number.isSafeInteger(resposta.totalCount)||resposta.totalCount<0)))
   erro('EXTRATO_PAGINACAO_INDETERMINADA');
  if(totalEsperado===null&&resposta.totalCount!==undefined)
   totalEsperado=resposta.totalCount;
  if(resposta.totalCount!==undefined&&totalEsperado!==resposta.totalCount)
   erro('EXTRATO_TOTAL_ALTERADO_DURANTE_CONSULTA');
  for(const item of resposta.data){
   if(!item||typeof item!=='object'||Array.isArray(item)||
      !idOk(item.id)||typeof item.type!=='string'||
      !/^[A-Z][A-Z0-9_]{1,119}$/.test(item.type))
    erro('EXTRATO_ITEM_SEM_IDENTIDADE');
   const id=String(item.id);
   if(vistos.has(id))
    erro('EXTRATO_ITEM_DUPLICADO_ENTRE_PAGINAS');
   vistos.add(id);
   const c=centavosExatos(item.value);
   const reconhecido=TIPOS_RECONHECIDOS.has(item.type);
   // Campos desconhecidos sao preservados no digest, NUNCA
   // interpretados como credito. A resposta nao contem PII nem JSON bruto.
   registros.push(Object.freeze({
    transacaoId:id,tipo:item.type,
    centavosExatosInformados:c,
    classificacao:!reconhecido?'TIPO_NAO_CLASSIFICADO':
      c===null?'VALOR_INDETERMINADO':'SOMENTE_EXTRATO_SANDBOX',
    digest:assinatura(item)
   }));
  }
  paginas++;
  if(!resposta.hasMore){
   if(totalEsperado!==null&&totalEsperado!==registros.length)
    erro('EXTRATO_TOTAL_PAGINACAO_DIVERGENTE');
   return Object.freeze({
    origem,periodo:Object.freeze({inicio,fim}),
    paginas,totalRegistros:registros.length,
    registros:Object.freeze(registros),
    tiposNaoClassificados:registros.filter(x=>
     x.classificacao!=='SOMENTE_EXTRATO_SANDBOX').length,
    paginasCompletas:true,
    credenciaisReaisAutenticadas:false,
    contaTitularComprovada:false,
    liquidacaoRealCertificada:false,
    permiteSaqueReal:false,permiteCreditoPosicao:false,
    metodo:'GET_EXCLUSIVO_SANDBOX'
   });
  }
 }
 erro('EXTRATO_INCOMPLETO_LIMITE_PAGINAS');
}
module.exports={validarPeriodo,fontesCandidatasExtrato,
 coletarExtratoReadOnly};
