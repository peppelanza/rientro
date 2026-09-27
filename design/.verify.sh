#!/bin/sh
# Compares each imported file's byte size with the size reported by Claude Design.
cd "$(dirname "$0")" || exit 1
missing=0; diff=0
while read -r line; do
  f="${line% *}"; s="${line##* }"
  if [ ! -f "$f" ]; then echo "MISSING $f"; missing=$((missing+1)); continue; fi
  a=$(wc -c < "$f" | tr -d ' ')
  [ "$a" = "$s" ] || { echo "DIFF    $f ($a vs $s)"; diff=$((diff+1)); }
done < .expected-sizes
echo "missing=$missing diff=$diff"
