'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const raiz=path.resolve(__dirname,'..');
function visitar(dir,saida=[]){
 for(const nome of fs.readdirSync(dir)){
  if(['.git','node_modules','artifacts','coverage'].includes(nome))continue;
  const absoluto=path.join(dir,nome);
  const stat=fs.statSync(absoluto);
  if(stat.isDirectory())visitar(absoluto,saida);
  else if(/\.(?:js|ts|mjs|html|css|md|json|yml|yaml|txt)$/.test(nome))saida.push(absoluto);
 }
 return saida;
}
test('Auditoria integral: seis eventos por giro e ausencia de regras antigas executaveis',()=>{
 const arquivos=visitar(raiz);
 const referencias=[];
 for(const arquivo of arquivos){
  const relativo=path.relative(raiz,arquivo).replaceAll(path.sep,'/');
  const linhas=fs.readFileSync(arquivo,'utf8').split(/\r?\n/);
  for(let i=0;i<linhas.length;i++){
   const linha=linhas[i];
   if(/\b(?:cinco|5)\s+(?:vendas|pedidos|compras|eventos|aportes)\s+(?:por|para|no|em|do|de)\s+(?:ciclo|giro)|(?:ciclo|giro)\s+(?:de|com|a cada)\s+(?:cinco|5)\s+(?:vendas|pedidos|compras|eventos)/i.test(linha))
    referencias.push({arquivo:relativo,linha:i+1,texto:linha.trim().slice(0,180)});
  }
 }
 const executaveis=referencias.filter(x=>x.arquivo.startsWith('src/')&&/\.(js|ts|mjs)$/.test(x.arquivo));
 assert.deepEqual(executaveis,[],'Referencias antigas no codigo operacional: '+JSON.stringify(executaveis));
 const ponte=fs.readFileSync(path.join(raiz,'src/domain/circuit-break-ponte-v6-demo-sqlite.js'),'utf8');
 assert.match(ponte,/const VENDAS_POR_GIRO=6;/);
 assert.ok(ponte.includes('Math.floor(pendentes.length/VENDAS_POR_GIRO)'));
 assert.ok(ponte.includes('elegiveis.slice(i*VENDAS_POR_GIRO,(i+1)*VENDAS_POR_GIRO)'));
 assert.ok(ponte.includes('size!==VENDAS_POR_GIRO'));
 console.log('AUDITORIA_INTEGRAL arquivos='+arquivos.length+
  ' referencias_historicas_5='+referencias.length+
  ' regras_antigas_executaveis='+executaveis.length);
 for(const item of referencias.slice(0,30))console.log('REFERENCIA_ANTIGA '+JSON.stringify(item));
});
