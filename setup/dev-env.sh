#!/usr/bin/env bash
# Create this project's own Python virtualenv.
#
# Deliberately NOT Hermes' venv: `hermes update` rewrites that, and we do not
# want our test dependencies entangled with the vendor's.
#
# Usage: bash setup/dev-env.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$REPO/.venv"
UV="$HOME/.hermes/bin/uv"

cd "$REPO"

if [ -x "$UV" ]; then
    echo "==> Creating venv with uv"
    "$UV" venv "$VENV" --python 3.12
    echo "==> Installing dev dependencies"
    VIRTUAL_ENV="$VENV" "$UV" pip install pytest
else
    echo "==> uv not found, falling back to python3 -m venv"
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install --quiet --upgrade pip
    "$VENV/bin/pip" install --quiet pytest
fi

echo
echo "==> Verifying"
"$VENV/bin/python" --version
"$VENV/bin/python" -m pytest --version

echo
echo "Done. Run tests with:"
echo "  .venv/bin/python -m pytest tests/ -q"
