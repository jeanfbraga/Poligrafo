#!/usr/bin/env bash
# Roda a matriz de testes de alçadas sequencialmente contra localhost:3000
set -u
mkdir -p .tmp_debug
run() {
  local name="$1"; local qs="$2"
  echo "===== [$(date +%H:%M:%S)] START $name ====="
  bash scripts/test_sse_pipe.sh "$qs" ".tmp_debug/${name}.jsonl" > ".tmp_debug/${name}_summary.log" 2>&1
  echo "===== [$(date +%H:%M:%S)] END $name ====="
}
run "t1_senador"      "nome=Sergio%20Moro&uf=PR"
run "t2_dep_federal"  "nome=Nikolas%20Ferreira&uf=MG"
run "t3_dep_estadual" "nome=Andr%C3%A9%20do%20Prado&uf=SP"
run "t4_prefeito"     "nome=Jo%C3%A3o%20Campos&uf=PE&cargo=PREFEITO"
run "t5_vereador"     "nome=Rafael%20Aloisio%20Freitas&uf=RJ"
echo "===== MATRIZ COMPLETA ====="
