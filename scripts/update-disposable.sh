#!/bin/sh
# Refreshes the list of throwaway-email domains used by src/email-check.js
set -e
cd "$(dirname "$0")/.."
curl -fsSL https://raw.githubusercontent.com/disposable/disposable-email-domains/master/domains.txt -o src/data/disposable-domains.txt
wc -l src/data/disposable-domains.txt
