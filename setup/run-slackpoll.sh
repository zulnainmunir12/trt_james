#!/usr/bin/env bash
cd /mnt/c/Projects/hermes-trt-ops
export PYTHONPATH=/mnt/c/Projects/hermes-trt-ops/src
PY=.venv/bin/python
[ -x "$PY" ] || PY=python3
$PY -m hermes_trt.slackpoll "$@"
