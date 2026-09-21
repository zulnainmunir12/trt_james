"""Guards on client identity.

A name on a clinical ticket is an identifier, not a description. These tests
pin the two behaviours that matter: the same person must collapse to one
record, and an ambiguous name must produce nothing rather than a guess.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from hermes_trt import clients  # noqa: E402


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    monkeypatch.setattr(clients, "REGISTRY", tmp_path / "clients.json")


def test_email_sender_is_the_client():
    assert clients.register_email("d.whitcombe@example.com") == "D. Whitcombe"
    assert clients.resolve("d.whitcombe@example.com") == "D. Whitcombe"


def test_full_name_upgrades_the_record_instead_of_adding_one():
    """The live board had Daniel as three people. This is why."""
    clients.register_email("d.whitcombe@example.com")
    assert clients.merge_name("Daniel Whitcombe") == "Daniel Whitcombe"

    # One record, not two, and the address still resolves to the fuller name.
    names = {n for n in clients.known_names()}
    assert "Daniel Whitcombe" in names
    assert clients.resolve("d.whitcombe@example.com") == "Daniel Whitcombe"
    assert len(clients._load()) == 1


def test_address_fragment_is_normalised_not_added():
    clients.register_email("d.whitcombe@example.com")
    clients.merge_name("d.whitcombe")          # what the old classifier emitted
    assert len(clients._load()) == 1


def test_bare_first_name_is_refused():
    """"Daniel" cannot be told apart from another Daniel. Recording nothing
    beats recording an ambiguity on a patient record."""
    assert clients.merge_name("Daniel") is None
    assert clients._load() == {}


def test_a_name_in_chat_text_resolves_to_the_record():
    clients.register_email("p.sharma@example.com")
    clients.merge_name("Priya Sharma")
    got = clients.resolve(
        "sarah in #care-ops",
        "Can someone chase the lab about Priya Sharma's outstanding bloods?")
    assert got == "Priya Sharma"


def test_an_unknown_name_yields_nothing():
    clients.register_email("p.sharma@example.com")
    got = clients.resolve("sarah in #care-ops",
                          "Can someone call Jonathan Entwistle back?")
    assert got is None, "an unknown name must not be invented onto a ticket"


def test_our_own_addresses_are_not_clients():
    assert clients.register_email("hermestrt00@gmail.com") is None
    assert clients.resolve("hermestrt00@gmail.com") is None


def test_different_people_sharing_an_initial_do_not_merge():
    clients.register_email("j.harding@example.com")     # J. Harding
    clients.merge_name("James Harding")
    clients.merge_name("Jane Hardcastle")               # different surname
    assert len(clients._load()) == 2


def test_a_full_name_in_chat_upgrades_a_record_built_from_an_address():
    """The registry starts with "D. Whitcombe" from his email address. The
    first time a message spells him out, the record should gain the real
    name - not gain a second person."""
    clients.register_email("d.whitcombe@example.com")
    assert clients.resolve("d.whitcombe@example.com") == "D. Whitcombe"

    got = clients.resolve(
        "sarah in #care-ops",
        "Can someone book Daniel Whitcombe in for his twelve-week review?")

    assert got == "Daniel Whitcombe"
    assert len(clients._load()) == 1, "learning a fuller name must not add a record"
    # and the address now resolves to the fuller name too
    assert clients.resolve("d.whitcombe@example.com") == "Daniel Whitcombe"


def test_an_unrelated_full_name_is_not_absorbed_into_a_record():
    clients.register_email("d.whitcombe@example.com")
    got = clients.resolve("sarah in #care-ops",
                          "Can someone call Jonathan Entwistle back?")
    assert got is None
    assert len(clients._load()) == 1
    assert clients.known_names() == ["D. Whitcombe"]
