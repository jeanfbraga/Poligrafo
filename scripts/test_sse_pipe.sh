#!/usr/bin/env bash
# Uso: ./scripts/test_sse_pipe.sh "<querystring>" "<arquivo_saida>"
# Consome o SSE de /api/investigar, salva eventos brutos e imprime resumo.
QS="$1"
OUT="${2:-/tmp/pipe_test.jsonl}"
URL="http://localhost:3000/api/investigar?${QS}"
echo "[SSE] GET $URL"
curl -sN --max-time 900 "$URL" -o "$OUT"
echo "[SSE] stream encerrado. Eventos: $(grep -c '^data: ' "$OUT" 2>/dev/null || echo 0)"
node -e '
const fs=require("fs");
const lines=fs.readFileSync(process.argv[1],"utf8").split("\n");
const counts={}; const statuses=[]; const nodes=[]; let done=null, err=null, graphScores=null, candidatos=null;
for(const l of lines){
  if(!l.startsWith("data: "))continue;
  try{
    const e=JSON.parse(l.slice(6));
    counts[e.tipo]=(counts[e.tipo]||0)+1;
    if(e.tipo==="STATUS")statuses.push(e.payload.msg);
    if(e.tipo==="NODE_NOVO")nodes.push({type:e.payload.type,label:e.payload?.data?.label,score:e.payload?.data?.score_letalidade});
    if(e.tipo==="DONE")done=e.payload;
    if(e.tipo==="ERROR")err=e.payload;
    if(e.tipo==="CANDIDATOS_ENCONTRADOS")candidatos=e.payload.candidatos;
    if(e.tipo==="GRAPH_ANALYSIS_SCORES")graphScores=e.payload;
  }catch(_){}
}
console.log("== RESUMO DE EVENTOS =="); console.log(JSON.stringify(counts,null,1));
if(candidatos){console.log("== CANDIDATOS ==");candidatos.forEach(c=>console.log(" -",c.ref,"|",c.nome,"|",c.cargo||""));}
console.log("== NODES ("+nodes.length+") ==");
const byType={}; nodes.forEach(n=>{byType[n.type]=(byType[n.type]||0)+1});
console.log(JSON.stringify(byType,null,1));
nodes.slice(0,60).forEach(n=>console.log(` - [${n.type}] ${String(n.label).slice(0,70)}${n.score!=null?" | score="+n.score:""}`));
if(graphScores){const susp=Object.entries(graphScores).filter(([k,v])=>v.suspicious);console.log("== GRAPH_ANALYSIS: "+Object.keys(graphScores).length+" nós, "+susp.length+" suspeitos ==");susp.slice(0,10).forEach(([k,v])=>console.log(" ! SUSP:",k,"score="+v.suspicionScore,"deg="+v.degree));}
if(err)console.log("== ERROR ==",JSON.stringify(err));
if(done)console.log("== DONE ==",JSON.stringify(done));
console.log("== ÚLTIMOS STATUS ==");statuses.slice(-8).forEach(s=>console.log(" >",s));
' "$OUT"
