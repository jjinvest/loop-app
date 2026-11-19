'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {verificar,hashGitBlob,ERRO}=require('../scripts/trava-base-real');

test('a base REAL atual e identica ao snapshot do Railway',()=>{
 const result=verificar();
 assert.equal(result.ok,true);
 assert.ok(result.arquivos>800);
});
function bancada(t){
 const raiz=fs.mkdtempSync(path.join(os.tmpdir(),'loop-trava-real-'));
 t.after(()=>fs.rmSync(raiz,{recursive:true,force:true}));
 for(const p of ['src','scripts','public','test','.github/workflows','docs'])
  fs.mkdirSync(path.join(raiz,p),{recursive:true});
 const arquivos=['src/motor.js','scripts/operar.js','public/home.html',
  'test/regressao.test.js','.github/workflows/outro.yml',
  'package.json','package-lock.json','Dockerfile.preview','Dockerfile.public-real',
  '.dockerignore','.gitignore'];
 for(const p of arquivos)fs.writeFileSync(path.join(raiz,p),'conteudo aprovado '+p+'\n');
 const manifesto={schema:1,proprietarioAutorizacaoExigida:true,
  algoritmo:'git-blob-sha1',referenciaGit:'exemplo-somente-teste',
  arquivos:arquivos.sort().map(p=>({path:p,sha:hashGitBlob(fs.readFileSync(path.join(raiz,p)))}))};
 fs.writeFileSync(path.join(raiz,'docs/TRAVA_BASE_REAL_ATUAL_20261119.json'),JSON.stringify(manifesto));
 return raiz;
}
test('edicao nao autorizada do motor e bloqueada',t=>{
 const raiz=bancada(t);
 assert.equal(verificar({raiz}).ok,true);
 fs.appendFileSync(path.join(raiz,'src/motor.js'),'ALTERACAO NA CATRACA\n');
 assert.throws(()=>verificar({raiz}),e=>
  e.codigo===ERRO&&e.message.includes('src/motor.js'));
});
test('alteracao de interface, suite e CI tambem e bloqueada',t=>{
 const raiz=bancada(t);
 for(const arquivo of ['public/home.html','test/regressao.test.js','.github/workflows/outro.yml']){
  const completo=path.join(raiz,arquivo);
  const original=fs.readFileSync(completo);
  fs.appendFileSync(completo,'DESVIO\n');
  assert.throws(()=>verificar({raiz}),e=>e.codigo===ERRO);
  fs.writeFileSync(completo,original);
 }
});
test('arquivo nao aprovado novo ou removido tambem impede deploy',t=>{
 const raiz=bancada(t);
 fs.writeFileSync(path.join(raiz,'src/alteracao-solta.js'),'invasao');
 assert.throws(()=>verificar({raiz}),e=>e.codigo===ERRO);
 fs.unlinkSync(path.join(raiz,'src/alteracao-solta.js'));
 fs.unlinkSync(path.join(raiz,'src/motor.js'));
 assert.throws(()=>verificar({raiz}),e=>e.codigo===ERRO);
});
test('a propria alteracao do manifesto exige ancora externa Railway',t=>{
 const raiz=bancada(t);
 fs.appendFileSync(path.join(raiz,'src/motor.js'),'novo');
 const arquivo=path.join(raiz,'docs/TRAVA_BASE_REAL_ATUAL_20261119.json');
 const m=JSON.parse(fs.readFileSync(arquivo));
 m.arquivos.find(x=>x.path==='src/motor.js').sha=hashGitBlob(fs.readFileSync(path.join(raiz,'src/motor.js')));
 fs.writeFileSync(arquivo,JSON.stringify(m));
 // Demonstra risco real: manifesto atualizado junto com o codigo passaria
 // neste verificador. Railways exige fingerprint fixa fora do repo.
 assert.equal(verificar({raiz}).ok,true);
});
