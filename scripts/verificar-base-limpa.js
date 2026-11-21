'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const base=path.resolve(__dirname,'..');
const doc=JSON.parse(fs.readFileSync(path.join(base,'MANIFESTO_BASE_LIMPA.json'),'utf8'));
const errors=[];
const present=new Set(doc.files.map(f=>f.path));
for(const entry of doc.files){
 const abs=path.join(base,entry.path);
 if(!fs.existsSync(abs)){errors.push('AUSENTE '+entry.path);continue;}
 const bytes=fs.readFileSync(abs);
 const sha=crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 if(sha!==entry.gitSha)errors.push('HASH '+entry.path);
 if(entry.path.endsWith('.js')){
  const code=bytes.toString('utf8');
  const rx=/\brequire\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let match;
  while((match=rx.exec(code))!==null){
   const local=path.resolve(path.dirname(abs),match[1]);
   const options=[local,local+'.js',local+'.json',path.join(local,'index.js')];
   if(!options.some(x=>fs.existsSync(x)))errors.push('IMPORT '+entry.path+' -> '+match[1]);
  }
 }
}
const visuals=['src/producao/interface-aprovada-loop.js','src/candidato/checkout-candidato-ui.html',
 'src/candidato/escritorio-admin-candidato-ui.html','src/laboratorio/loja-cliente-demo.html',
 'src/laboratorio/loja-cliente-demo.css','src/laboratorio/checkout-staging-ui.css',
 'src/laboratorio/loop-03-shell.css'];
for(const f of visuals)if(!present.has(f))errors.push('TELA_REAL_AUSENTE '+f);
console.log('BASE_LIMPA_ARQUIVOS='+doc.files.length+';ORIGEM='+doc.sourceCommit+
 ';ERROS='+errors.length);
for(const err of errors)console.error(err);
if(errors.length)process.exitCode=1;
