#!/usr/bin/env python3
"""Point Hermes at a model provider.

Usage:
    python3 setup/configure-provider.py gemini <API_KEY>
    python3 setup/configure-provider.py gemini <API_KEY> --model gemini-3.5-flash

Writes the key to ~/.hermes/.env (chmod 600) and the model/provider to
~/.hermes/config.yaml. Backs both up first.

Only first-class Hermes providers are offered. `provider: "custom"` loses
model metadata and produces misleading "conversation too large" errors that
are really HTTP 413s - see docs/DEPLOYMENT-NOTES.md #3.
"""
import argparse
import os
import re
import shutil
import sys
from datetime import datetime

# provider -> (hermes provider key, env var names, default model)
PROVIDERS = {
    "gemini": ("gemini", ("GEMINI_API_KEY", "GOOGLE_API_KEY"), "gemini-3.6-flash"),
    "anthropic": ("anthropic", ("ANTHROPIC_API_KEY",), "claude-opus-4.6"),
    "openrouter": ("openrouter", ("OPENROUTER_API_KEY",), "anthropic/claude-opus-4.6"),
}

HERMES = os.path.join(os.path.expanduser("~"), ".hermes")
ENV = os.path.join(HERMES, ".env")
CFG = os.path.join(HERMES, "config.yaml")


def backup(path: str) -> None:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = f"{path}.{stamp}.bak"
    shutil.copy2(path, dest)
    print(f"    backed up -> {os.path.basename(dest)}")


def set_env_var(text: str, var: str, value: str) -> str:
    """Set VAR=value, replacing a set, empty, or commented-out entry."""
    pattern = re.compile(rf"^#?\s*{re.escape(var)}=.*$", re.MULTILINE)
    line = f"{var}={value}"
    if pattern.search(text):
        return pattern.sub(line, text, count=1)
    return text.rstrip("\n") + f"\n{line}\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("provider", choices=sorted(PROVIDERS))
    ap.add_argument("api_key")
    ap.add_argument("--model", help="override the default model")
    args = ap.parse_args()

    if not os.path.isdir(HERMES):
        print(f"ERROR: {HERMES} not found - install Hermes first.", file=sys.stderr)
        return 1

    provider_key, env_vars, default_model = PROVIDERS[args.provider]
    model = args.model or default_model

    # --- .env ---------------------------------------------------------
    print("==> .env")
    backup(ENV)
    with open(ENV, encoding="utf-8") as fh:
        env = fh.read()

    for var in env_vars:
        env = set_env_var(env, var, args.api_key)

    # Blank other providers' keys so auto-detection cannot silently fall
    # back to a stale endpoint from an earlier configuration.
    for other, (_, other_vars, _) in PROVIDERS.items():
        if other == args.provider:
            continue
        for var in other_vars:
            if var not in env_vars:
                env = set_env_var(env, var, "")
    env = set_env_var(env, "OPENAI_API_KEY", "")

    with open(ENV, "w", encoding="utf-8") as fh:
        fh.write(env)
    os.chmod(ENV, 0o600)
    for var in env_vars:
        print(f"    {var}: SET ({len(args.api_key)} chars)")

    # --- config.yaml --------------------------------------------------
    print("==> config.yaml")
    backup(CFG)
    with open(CFG, encoding="utf-8") as fh:
        cfg = fh.read()

    edits = [
        (r"^(\s*)default:.*$", rf'\g<1>default: "{model}"'),
        (r'^(\s*)provider:\s*".*?"', rf'\g<1>provider: "{provider_key}"'),
    ]
    for pat, rep in edits:
        cfg, n = re.subn(pat, rep, cfg, count=1, flags=re.MULTILINE)
        if n == 0:
            print(f"    WARNING: no match for {pat}", file=sys.stderr)

    with open(CFG, "w", encoding="utf-8") as fh:
        fh.write(cfg)

    print(f'    provider: "{provider_key}"')
    print(f'    model:    "{model}"')
    print("\nNow run: bash setup/smoke-test.sh")
    return 0


if __name__ == "__main__":
    sys.exit(main())
