'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const editor=fs.readFileSync(path.join(__dirname,
 '../src/producao/operador-loja-fotos-real.js'),'utf8');
const loja=fs.readFileSync(path.join(__dirname,
 '../src/producao/interface-aprovada-loja.js'),'utf8');
const loop=fs.readFileSync(path.join(__dirname,
 '../src/producao/interface-aprovada-contas.js'),'utf8');

function recortar(inicio,fim){
 const a=editor.indexOf(inicio),b=editor.indexOf(fim,a);
 assert.ok(a>=0&&b>a,'função real do editor deve existir');
 return editor.slice(a,b);
}
test('mensagem de moldura some sozinha após 4 segundos e outra mensagem reinicia prazo',()=>{
 const fonte=recortar(' let anuncioArrasto=null,temporizadorAvisoArrasto=null;',
  ' const posicaoCard=');
 const agendados=new Map();
 let seguinte=0,remocoes=0,anexos=0;
 const documento={
  createElement:tag=>{
   assert.equal(tag,'div');
   return {className:'',textContent:'',setAttribute(){},
    remove(){remocoes++;}};
  },
  body:{append(x){anexos++;assert.equal(x.className,'akitemm-arrasto-aviso');}}
 };
 const criar=(callback,ms)=>{
  const id=++seguinte;agendados.set(id,{callback,ms});return id;
 };
 const cancelar=id=>agendados.delete(id);
 const origem=new Function('document','setTimeout','clearTimeout',
  fonte+'; return {avisarArrasto,atual:()=>anuncioArrasto};');
 const visor=origem(documento,criar,cancelar);
 visor.avisarArrasto('Molduras vazias trocadas entre as posições 12 e 11.');
 assert.equal(anexos,1);
 assert.equal(agendados.size,1);
 assert.equal([...agendados.values()][0].ms,4000);
 visor.avisarArrasto('Produto organizado.');
 assert.equal(anexos,1,'não duplicar avisos fixos');
 assert.equal(agendados.size,1,'temporizador anterior cancelado');
 assert.equal(visor.atual().textContent,'Produto organizado.');
 const atual=[...agendados.values()][0];
 atual.callback();
 assert.equal(remocoes,1);
 assert.equal(visor.atual(),null,'mensagem retirada automaticamente');
 visor.avisarArrasto('Nova mensagem.');
 assert.equal(anexos,2,'novo aviso aparece após o anterior sumir');
});
test('alternância de visão fica no LOOP, sem botão duplicado na AKITEMM',()=>{
 assert.doesNotMatch(editor,/function sincronizarAlternanciaVisao/);
 assert.doesNotMatch(editor,/Visão do Administrador|Visão do Cliente/);
 assert.match(editor,/document.getElementById\('akitemmAlternarVisao'\)\?\.remove\(\)/);
 assert.match(editor,/if\(operadorAutenticado&&!visaoClienteSolicitada\)/);
 assert.match(editor,/operador=cliente\.status===401/);
 assert.match(editor,/if\(!operador\)\{atual\?\.remove\(\)/);
 assert.match(editor,/if\(!operador\|\|arrasto\|\|dialogo\?\.open/);
 assert.match(loop,/\/loja\?visao=/);
});
test('prévia cliente nunca herda dados financeiros, identidade ou permissões de edição',()=>{
 assert.match(loja,/operadorAtivo=false,operadorAutenticadoLoja=false/);
 assert.match(loja,/clienteNick=null,csrfLoja=null/);
 assert.match(loja,/function deveAtivarOperadorLoja/);
 assert.match(loja,/visaoClienteLoja/);
 assert.match(loja,/VISÃO DO CLIENTE/);
 assert.match(loja,/Nenhuma conta pessoal foi acessada/);
 assert.match(loja,/if\(operadorAtivo\)\{\s*const pedidos=\$\('pedidosLojaLoop'\)/);
 assert.match(loja,/if\(visitante\|\|operadorAtivo\|\|!csrfLoja\)return/);
 assert.match(loja,/const bloqueado=visitante&&!operadorAtivo;/);
 assert.doesNotMatch(loja,/operadorAtivo&&visaoClienteLoja\)\)/);
 assert.match(loja,/const caminho=bloqueado\?null:operadorAtivo\?/);
});
test('navegação entre LOOP e AKITEMM preserva a visão sem conceder poder ao cliente',()=>{
 assert.match(loop,/\/loja\?visao=/);
 assert.match(loop,/modoOperadorAtual\?'operador':'cliente'/);
 assert.match(loja,/\/escritorio\?visao=/);
 assert.match(loja,/visaoOperadorLoja\|\|clienteAutenticado===false/);
 assert.match(loja,/voltarLoop\.href=operadorAtivo\?/);
 assert.match(loja,/\/escritorio\?visao=cliente/); // retorno do cliente
});
