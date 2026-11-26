'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const {join}=require('node:path');
const {renderizarAdminComercialAprovado}=
 require('../src/producao/interface-admin-comercial-aprovada');
const {calcularIntervaloMeta}=
 require('../src/domain/meta-lotes-catraca-loop');
const client=readFileSync(join(__dirname,
 '../src/producao/interface-admin-comercial-client.js'),'utf8');
const html=renderizarAdminComercialAprovado();

function previa({quantidade='5',abertura='09:00',fechamento='18:00'}={}){
 const elementos={
  metaCentrosDiaAdmin:{value:quantidade,listeners:{}},
  inicioCatracaAdmin:{value:abertura,listeners:{}},
  fimCatracaAdmin:{value:fechamento,listeners:{}},
  previsaoLuzesAdmin:{textContent:'',listeners:{}}
 };
 for(const x of Object.values(elementos))
  x.addEventListener=function(tipo,callback){this.listeners[tipo]=callback};
 const inicio=client.indexOf(' function atualizarPrevisaoLuzesAdmin(){');
 const fim=client.indexOf(' async function atualizarCatracaAdmin(',inicio);
 assert.ok(inicio>0&&fim>inicio,'função cliente deve existir');
 const codigo=client.slice(inicio,fim);
 const contexto={$:id=>elementos[id]};
 runInNewContext(codigo,contexto,{timeout:1500});
 return {elementos,calcular:contexto.atualizarPrevisaoLuzesAdmin};
}

test('relógio aparece com 09 às 18 sem aguardar cadastro ou salvar',()=>{
 assert.match(html,/id="inicioCatracaAdmin"[^>]*value="09:00"/);
 assert.match(html,/id="fimCatracaAdmin"[^>]*value="18:00"/);
 assert.match(html,/Pessoas contempladas por dia/);
 assert.match(html,/id="previsaoLuzesAdmin"[^>]*aria-live="polite"/);
 assert.ok(html.indexOf('id="fimCatracaAdmin"')<
  html.indexOf('id="previsaoLuzesAdmin"'));
 assert.ok(html.indexOf('id="previsaoLuzesAdmin"')<
  html.indexOf('id="salvarCatracaAdmin"'));
});
test('cinco contemplados: cálculo instantâneo de 30 luzes e 18 minutos',()=>{
 const {elementos,calcular}=previa();
 assert.equal(calcular(),true);
 const msg=elementos.previsaoLuzesAdmin.textContent;
 assert.match(msg,/PRÉVIA ANTES DE SALVAR/);
 assert.match(msg,/5 pessoa\(s\)/);
 assert.match(msg,/09:00 às 18:00/);
 assert.match(msg,/30 luzes/);
 assert.match(msg,/18min por luz/);
 assert.match(msg,/1h 48min por pessoa/);
 assert.match(msg,/não realiza giro nem pagamento/);
 const base=calcularIntervaloMeta({
  abertura:'09:00',fechamento:'18:00',quantidade:5
 });
 assert.equal(base.intervaloLuzSegundos,18*60);
 assert.equal(base.luzesPlanejadas,'30');
});
test('input e seletor de horário no celular recalculam sem chamar rede',()=>{
 const {elementos,calcular}=previa();
 let resultado=0;
 for(const id of ['metaCentrosDiaAdmin','inicioCatracaAdmin','fimCatracaAdmin']){
  assert.equal(typeof elementos[id].listeners.input,'function');
  assert.equal(typeof elementos[id].listeners.change,'function');
  resultado++;
 }
 assert.equal(resultado,3);
 elementos.metaCentrosDiaAdmin.value='10';
 elementos.metaCentrosDiaAdmin.listeners.input();
 assert.match(elementos.previsaoLuzesAdmin.textContent,/60 luzes/);
 assert.match(elementos.previsaoLuzesAdmin.textContent,/9min por luz/);
 elementos.inicioCatracaAdmin.value='08:00';
 elementos.fimCatracaAdmin.value='16:00';
 elementos.fimCatracaAdmin.listeners.change();
 assert.match(elementos.previsaoLuzesAdmin.textContent,/08:00 às 16:00/);
 assert.match(elementos.previsaoLuzesAdmin.textContent,/8min por luz/);
 elementos.metaCentrosDiaAdmin.value='5';
 assert.equal(calcular(),true);
 assert.match(elementos.previsaoLuzesAdmin.textContent,/16min por luz/);
});
test('previsão somente com formulário completo e meta numérica válida',()=>{
 const {elementos,calcular}=previa({quantidade:''});
 assert.equal(calcular(),false);
 assert.match(elementos.previsaoLuzesAdmin.textContent,/Informe o número/);
 elementos.metaCentrosDiaAdmin.value='cinco';
 assert.equal(calcular(),false);
 assert.match(elementos.previsaoLuzesAdmin.textContent,/quantidade inteira válida/);
 elementos.metaCentrosDiaAdmin.value='5';
 elementos.inicioCatracaAdmin.value='';
 assert.equal(calcular(),false);
 assert.match(elementos.previsaoLuzesAdmin.textContent,/Preencha o horário/);
 elementos.inicioCatracaAdmin.value='09:00';
 elementos.metaCentrosDiaAdmin.value='0';
 assert.equal(calcular(),true);
 assert.match(elementos.previsaoLuzesAdmin.textContent,/Informe o número/);
});
test('painel sugere horário padrão apenas em política ainda não configurada',()=>{
 assert.match(client,/d\.revisao===1&&/);
 assert.match(client,/d\.janelaInicio==='00:00'&&d\.janelaFim==='00:00'/);
 assert.match(client,/semHorarioConfigurado\?'09:00':d\.janelaInicio/);
 assert.match(client,/semHorarioConfigurado\?'18:00':d\.janelaFim/);
});

test('releitura preserva rascunho e revisão até Salvar ou Atualizar explícito',async()=>{
 const ids=['modoCatracaAdmin','inicioCatracaAdmin','fimCatracaAdmin',
  'limiteCatracaAdmin','metaCentrosDiaAdmin','metaDataAlvoAdmin','estadoCatracaAdmin'];
 const elementos=Object.fromEntries(ids.map(id=>[id,{value:'RASCUNHO',textContent:''}]));
 const salvo={revisao:7,modo:'AUTOMATICA',financeiroReal:false,janelaInicio:'09:00',janelaFim:'18:00',
  metaCentrosDia:5,metaDataAlvo:'2099-11-22',limiteDiario:null};
 const contexto={$:id=>elementos[id],apiCatraca:async()=>salvo,
  rascunhoCatracaSujo:true,politicaCatraca:{revisao:6},
  botoesCatraca:()=>{},atualizarPrevisaoLuzesAdmin:()=>{}};
 const inicio=client.indexOf(' async function atualizarCatracaAdmin(');
 const fim=client.indexOf(' function configurarCatraca(',inicio);
 runInNewContext(client.slice(inicio,fim),contexto);
 await contexto.atualizarCatracaAdmin();
 assert.equal(elementos.modoCatracaAdmin.value,'RASCUNHO');
 assert.equal(elementos.metaDataAlvoAdmin.value,'RASCUNHO');
 assert.equal(contexto.politicaCatraca.revisao,6,'a revisão do rascunho não encobre edição concorrente');
 await contexto.atualizarCatracaAdmin({forcar:true});
 assert.equal(elementos.modoCatracaAdmin.value,'AUTOMATICA');
 assert.equal(elementos.metaDataAlvoAdmin.value,'2099-11-22');
 assert.equal(contexto.politicaCatraca.revisao,7);
 assert.equal(contexto.rascunhoCatracaSujo,false);
});
