"""A canonical list of clients, and deterministic matching against it.

Asking a model to pull a client's name out of a message gives a different
answer each time. The live board proves it: the same person is recorded as
"Daniel", "d.whitcombe" and "Daniel Whitcombe", so the Clients view shows
three people where there is one, and nothing joins up.

A name on a clinical ticket needs to be an identifier, not a paraphrase.
So there is a registry, and matching is exact:

    email arrives  -> the sender address IS the client. No inference.
    chat message   -> scan the text for a name already in the registry.
    no match       -> leave it blank. Never guess a patient's name.

No model is involved, which also means a name can never be invented or
misspelt into the record.

The registry is seeded from addresses we have seen and is meant to be
replaced by the clinic's CRM as the source of truth once that is connected.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Optional

HERMES_HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
REGISTRY = Path(os.environ.get("HERMES_TRT_CLIENTS", HERMES_HOME / "trt-clients.json"))

#: Addresses that are us or our testing, not clients.
_OURS = re.compile(
    r"(hermestrt|noreply|no-reply|mailer-daemon|postmaster|zulnainmunir)", re.I)

#: A name written as an email local part, e.g. "d.whitcombe". The old
#: classifier emitted these, and left as-is they become a second record for
#: someone already in the registry.
_LOOKS_LIKE_LOCALPART = re.compile(r"^[a-z]+[._][a-z]+\d*$")

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")


#: "Daniel Whitcombe" in a sentence. Two capitalised words is a weak
#: signal on its own, which is why a hit still has to pass `_is_fuller`
#: against an existing record before it means anything.
_NAME_IN_TEXT = re.compile(r"\b([A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,20})\b")


def _load() -> dict:
    try:
        data = json.loads(REGISTRY.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001 - missing or corrupt means start empty
        return {}


def _save(data: dict) -> None:
    REGISTRY.parent.mkdir(parents=True, exist_ok=True)
    REGISTRY.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")


def _key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def name_from_email(addr: str) -> str:
    """A provisional display name from an address.

    `d.whitcombe@example.com` -> `D. Whitcombe`. Provisional because the real
    first name is not in the address; it is upgraded by `merge_name` the
    first time the full name appears in a message.
    """
    local = addr.split("@", 1)[0]
    parts = [p for p in re.split(r"[._-]+", local) if p]
    out = []
    for p in parts:
        out.append(p.upper() + "." if len(p) == 1 else p.capitalize())
    return " ".join(out) or addr


def _is_fuller(candidate: str, current: str) -> bool:
    """Is `candidate` the same person written more completely?

    "Daniel Whitcombe" beats "D. Whitcombe" and beats "Daniel". Matching on
    surname plus a compatible first token keeps this from merging two
    different people who share a surname initial.
    """
    c = candidate.strip().split()
    k = current.strip().split()
    if not c or not k:
        return False
    if c[-1].lower() != k[-1].lower():      # surnames must match exactly
        return False
    if len(c) < len(k):
        return False
    cf, kf = c[0].rstrip("."), k[0].rstrip(".")
    if kf.lower() == cf.lower():
        return len(candidate) > len(current)
    # current is an initial, candidate spells it out
    return len(kf) == 1 and cf.lower().startswith(kf.lower())


def register_email(addr: str) -> Optional[str]:
    """Record a sender as a client. Returns the canonical name."""
    addr = addr.strip().lower()
    if not addr or _OURS.search(addr):
        return None
    data = _load()
    for key, rec in data.items():
        if addr in rec.get("emails", []):
            return rec["name"]
    name = name_from_email(addr)
    key = _key(name)
    rec = data.setdefault(key, {"name": name, "emails": [], "aliases": []})
    if addr not in rec["emails"]:
        rec["emails"].append(addr)
    _save(data)
    return rec["name"]


def merge_name(name: str) -> Optional[str]:
    """Fold a spelled-out name into an existing record, or add it.

    This is what turns "D. Whitcombe" into "Daniel Whitcombe" once a message
    mentions him properly, so the board stops showing two people.

    Returns None for anything that cannot serve as an identifier. A bare
    first name is the important case: "Daniel" cannot be matched to a record
    or told apart from another Daniel, and adding it creates a phantom
    client. Recording nothing is better than recording an ambiguity.
    """
    name = " ".join((name or "").split())
    if not name or len(name) < 3:
        return None

    # "d.whitcombe" is an address fragment, not a name. Normalise it so it
    # lands on the record that address already created.
    if _LOOKS_LIKE_LOCALPART.match(name.lower()):
        name = name_from_email(name.lower() + "@x")

    if len(name.split()) < 2:
        return None

    data = _load()

    for key, rec in data.items():
        if rec["name"].lower() == name.lower():
            return rec["name"]
        if _is_fuller(name, rec["name"]):
            rec.setdefault("aliases", [])
            if rec["name"] not in rec["aliases"]:
                rec["aliases"].append(rec["name"])
            rec["name"] = name
            _save(data)
            return name

    data[_key(name)] = {"name": name, "emails": [], "aliases": []}
    _save(data)
    return name


def known_names() -> list[str]:
    """Every name and alias, longest first so the fullest match wins."""
    out = []
    for rec in _load().values():
        out.append(rec["name"])
        out.extend(rec.get("aliases", []))
    return sorted(set(out), key=len, reverse=True)


def canonical(name: str) -> str:
    """Map any known alias back to the one recorded name."""
    for rec in _load().values():
        if name.lower() == rec["name"].lower():
            return rec["name"]
        if any(name.lower() == a.lower() for a in rec.get("aliases", [])):
            return rec["name"]
    return name


def resolve(sender: str, body: str = "") -> Optional[str]:
    """The client this message is about, or None.

    An email sender is definitive - that address is the client. For chat the
    sender is a staff member, so the text is scanned for a name already in
    the registry. Nothing is inferred; an unrecognised name yields None.
    """
    addr = _EMAIL.search(sender or "")
    if addr:
        found = addr.group(0).lower()
        if not _OURS.search(found):
            for rec in _load().values():
                if found in rec.get("emails", []):
                    return rec["name"]
            return register_email(found)

    for name in known_names():
        if re.search(rf"\b{re.escape(name)}\b", body or "", re.IGNORECASE):
            return canonical(name)

    # The registry may hold only "D. Whitcombe", built from an address,
    # while the message says "Daniel Whitcombe". Look for a spelled-out
    # name that is the same person written more fully and fold it in, so
    # the record gains the real name instead of gaining a second client.
    #
    # `_is_fuller` demands an exact surname match plus a compatible first
    # token, so an unrelated person cannot be absorbed into a record.
    for candidate in _NAME_IN_TEXT.findall(body or ""):
        for rec in _load().values():
            if _is_fuller(candidate, rec["name"]):
                return merge_name(candidate)
    return None
