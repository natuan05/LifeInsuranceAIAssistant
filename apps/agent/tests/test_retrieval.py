"""Retrieval engine and tool statuses (plan Task 8) with an in-memory index that applies scope like the SQL does.
Real SQL/scope/roles are covered by test_retrieval_db.py; neither proves semantic quality (Task 9)."""
import copy
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from life_agent import contracts
from life_agent.core_client import CoreError
from life_agent.corpus import build_chunks, chunk_metadata, fingerprint, prepare_document, resolve_refs
from life_agent.retrieval import Row, RetrievalService, SearchConfig, SearchEngine, SearchUnavailable, query_terms, rrf
from life_agent.store import AttemptInvalid

from corpus_fixtures import TRUNCATED, corpus_config, fixture_manifest
from rag_fakes import HashEmbedding, embedding_config

NOW = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)
BENEFIT_QUERY = "Công ty mô phỏng chi trả 100% Số Tiền Bảo Hiểm cho mỗi Ngày Nằm Viện"


def search_config(**overrides) -> SearchConfig:
    values = dict(config_id="test-search-v1", fts_config="simple", fts_query_mode="or", keyword_candidates=20,
                  vector_candidates=20, fused_candidates=10, max_evidence=6, rrf_k=60, parent_expansion=True,
                  parent_max_chars=4000, ref_expansion_depth=1, ref_max_targets=2, max_evidence_chars=12000,
                  statement_timeout_ms=2000, scope_timeout_s=2.0)
    values.update(overrides)
    return SearchConfig(**values)


class MemoryIndex:
    """IndexReader double: same scope rule as the SQL (exact document/version/policy pairs, access scope)."""

    def __init__(self, rows: list[Row], embed_cfg, *, fail: set[str] = frozenset()):
        self.rows_ = rows
        self.cfg = embed_cfg
        self.fail = set(fail)
        self.calls: list[str] = []

    def _scoped(self, pairs, access):
        keys = {(p.document_id, p.document_version, p.policy_id) for p in pairs}
        return [r for r in self.rows_ if (r.document_id, r.document_version, r.metadata.get("policy_id")) in keys
                and r.metadata.get("access_scope", "PUBLIC") == access]

    def _check(self, name):
        self.calls.append(name)
        if name in self.fail:
            raise SearchUnavailable(name)

    def profile(self, pairs, access):
        self._check("profile")
        out = {}
        for r in self._scoped(pairs, access):
            if r.metadata["kind"] == "child":
                out.setdefault((r.document_id, r.document_version), set()).add(r.metadata["embedding"]["config_id"])
        return out

    def keyword(self, query, pairs, access, config):
        self._check("keyword")
        terms = query_terms(query)
        scored = []
        for r in self._scoped(pairs, access):
            if r.metadata["kind"] != "child":
                continue
            text = (r.metadata["prefix"] + " " + r.content).lower()
            hits = sum(1 for t in terms if t in text.split() or t in text)
            if hits:
                scored.append((-hits, r.id))
        return [i for _, i in sorted(scored)][: config.keyword_candidates]

    def vector(self, values, emb_id, pairs, access, config):
        self._check("vector")
        scored = []
        for r in self._scoped(pairs, access):
            if r.metadata["kind"] == "child" and r.metadata["embedding"]["config_id"] == emb_id:
                v = HashEmbedding.values(r.metadata["prefix"] + "\n\n" + r.content, self.cfg.dimensions)
                scored.append((-sum(a * b for a, b in zip(values, v)), r.id))
        return [i for _, i in sorted(scored)][: config.vector_candidates]

    def rows(self, ids, pairs, access):
        self._check("rows")
        scoped = {r.id: r for r in self._scoped(pairs, access)}
        return {i: scoped[i] for i in ids if i in scoped}

    def parents(self, keys, pairs, access):
        self._check("parents")
        return {r.metadata["chunk_key"]: r for r in self._scoped(pairs, access)
                if r.metadata["kind"] == "parent" and r.metadata["chunk_key"] in keys}

    def section(self, doc, ver, key, pairs, access):
        self._check("section")
        return [r for r in self._scoped(pairs, access) if r.metadata["kind"] == "parent"
                and (r.document_id, r.document_version, r.metadata["section_key"]) == (doc, ver, key)]


def index_rows(embed_cfg, *, document_id=None, version_label=None, config_id=None):
    manifest, source = fixture_manifest()
    catalog = {"document_id": document_id or str(uuid.uuid4()), "document_version": version_label or "fixture-v1"}
    version = prepare_document(source, manifest, corpus_config(), catalog=catalog)
    chunks = resolve_refs(build_chunks(version)).chunks
    identity = {**embed_cfg.identity(), **({"config_id": config_id} if config_id else {})}
    fp = fingerprint(version, identity["config_id"])
    rows = [Row(str(uuid.uuid4()), version.document_id, version.document_version, c.content,
                chunk_metadata(version, c, fp=fp, embedding=identity)) for c in chunks]
    return version, rows


def scope_of(*versions, kind="PUBLIC", decision="GRANTED", expires=None):
    if decision == "DENIED":
        return {"decision": "DENIED", "kind": kind, "policy_number": None, "reason": "NOT_AUTHORIZED"}
    return {"decision": "GRANTED", "kind": kind, "policy_number": None, "scope_version": "s1",
            "expires_at": (expires or NOW + timedelta(minutes=5)).isoformat().replace("+00:00", "Z"),
            "documents": [{"document_id": v.document_id, "document_version": v.document_version, "policy_id": None}
                          for v in versions]}


def engine(rows, *, embedder=None, fail=frozenset()):
    cfg = embedding_config()
    index = MemoryIndex(rows, cfg, fail=fail)
    return SearchEngine(index, embedder or HashEmbedding(), cfg), index


def valid(result):
    return contracts.validate("RetrievalResult", result)


# ---------------------------------------------------------------------------------------------- statuses

def test_status_ok_no_match_no_source_denied():
    version, rows = index_rows(embedding_config())
    eng, _ = engine(rows)
    ok = valid(eng.search("thời gian chờ", scope_of(version), search_config()))
    assert ok["status"] == "OK" and ok["degraded"] is False and ok["error"] is None
    assert valid(eng.search("zzzz qqqq", scope_of(version), search_config(vector_candidates=0)))["status"] == "NO_MATCH"
    assert valid(eng.search("thời gian chờ", scope_of(), search_config()))["status"] == "NO_SOURCE"
    assert valid(eng.search("thời gian chờ", scope_of(decision="DENIED"), search_config()))["status"] == "DENIED"


def test_embedding_outage_falls_back_to_keyword_only_with_degraded_flag():
    version, rows = index_rows(embedding_config())
    eng, index = engine(rows, embedder=HashEmbedding(fail_with="TIMEOUT"))
    result = valid(eng.search("thời gian chờ", scope_of(version), search_config()))
    assert result["status"] == "OK" and result["degraded"] is True and "vector" not in index.calls
    empty = valid(eng.search("zzzz", scope_of(version), search_config()))
    assert empty["status"] == "NO_MATCH" and empty["degraded"] is True  # not proof that no benefit exists


def test_keyword_failure_is_an_error_not_vector_only():
    version, rows = index_rows(embedding_config())
    eng, index = engine(rows, fail={"keyword"})
    result = valid(eng.search("thời gian chờ", scope_of(version), search_config()))
    assert result["status"] == "ERROR" and result["error"]["code"] == "SEARCH_UNAVAILABLE"
    assert "vector" not in index.calls


def test_rejected_embedding_call_is_not_treated_as_outage():
    version, rows = index_rows(embedding_config())
    eng, _ = engine(rows, embedder=HashEmbedding(fail_with="REJECTED"))
    result = valid(eng.search("thời gian chờ", scope_of(version), search_config()))
    assert result["status"] == "ERROR" and result["degraded"] is False


def test_vectors_from_another_space_are_never_compared():
    version, rows = index_rows(embedding_config(), config_id="other-model.v1")
    eng, index = engine(rows)
    result = valid(eng.search("thời gian chờ", scope_of(version), search_config()))
    assert result["error"]["code"] == "EMBEDDING_INCOMPATIBLE" and "vector" not in index.calls
    version, rows = index_rows(embedding_config())
    eng, index = engine(rows, embedder=HashEmbedding(identity_override={"dimensions": 32}))
    assert valid(eng.search("thời gian chờ", scope_of(version), search_config()))["error"]["code"] == "EMBEDDING_INCOMPATIBLE"
    assert "vector" not in index.calls


def test_database_error_is_error_never_no_match():
    version, rows = index_rows(embedding_config())
    for failing in ("profile", "rows"):
        eng, _ = engine(rows, fail={failing})
        result = valid(eng.search("thời gian chờ", scope_of(version), search_config()))
        assert result["status"] == "ERROR" and result["error"] == {"code": "SEARCH_UNAVAILABLE", "retryable": True}


# ---------------------------------------------------------------------------------------------- scope

def test_only_granted_document_versions_are_searched_or_expanded():
    granted, rows_a = index_rows(embedding_config(), version_label="fixture-v1")
    newer, rows_b = index_rows(embedding_config(), document_id=granted.document_id, version_label="fixture-v2")
    eng, _ = engine(rows_a + rows_b)
    result = valid(eng.search("thời gian chờ loại trừ quyền lợi", scope_of(granted), search_config()))
    assert {(e["document_id"], e["document_version"]) for e in result["evidence"]} == {(granted.document_id, "fixture-v1")}
    assert all(m["document_version"] == "fixture-v1" for m in result["missing"])


def test_reference_target_outside_scope_is_reported_not_opened():
    version, rows = index_rows(embedding_config())
    foreign = str(uuid.uuid4())
    for r in rows:
        for ref in r.metadata["refs"]:
            if ref.get("target_section_key") == "dieu-4":
                ref["target_document_id"] = foreign
    eng, _ = engine(rows)
    result = valid(eng.search("quyền lợi nằm viện", scope_of(version), search_config()))
    assert any(m["code"] == "REFERENCE_OUT_OF_SCOPE" and m["reference"] == "Điều 4" for m in result["missing"])
    assert all(e["document_id"] == version.document_id for e in result["evidence"])


def test_unindexed_document_in_scope_is_a_source_warning():
    version, rows = index_rows(embedding_config())
    missing_doc, _ = index_rows(embedding_config())
    eng, _ = engine(rows)
    result = valid(eng.search("thời gian chờ", scope_of(version, missing_doc), search_config()))
    assert {"code": "SOURCE_WARNING", "document_id": missing_doc.document_id} == {
        k: v for k, v in result["missing"][0].items() if k in ("code", "document_id")}


# ---------------------------------------------------------------------------------------------- assembly

def test_rrf_order_on_known_rankings():
    assert [i for i, _ in rrf([["a", "b", "c"], ["c", "a"]], 60)] == ["a", "c", "b"]


def test_parent_replaces_its_children_and_reference_targets_are_added_regardless_of_rank():
    version, rows = index_rows(embedding_config())
    eng, _ = engine(rows)
    result = valid(eng.search(BENEFIT_QUERY, scope_of(version), search_config(fused_candidates=1)))
    clauses = [e["location"]["clause"] for e in result["evidence"]]
    assert clauses[0] == "Điều 1. Quyền lợi nằm viện" and clauses.count(clauses[0]) == 1  # children deduplicated
    assert "Điều 3. Thời gian chờ" in clauses and "Điều 4. Loại trừ" in clauses  # refs followed outside top-k
    codes = {(m["code"], m.get("reference")) for m in result["missing"]}
    assert ("REFERENCE_TARGET_MISSING", "Điều 9") in codes and ("UNRESOLVED_REFERENCE", "Điều 5") in codes


def test_expansion_cap_is_reported():
    version, rows = index_rows(embedding_config())
    eng, _ = engine(rows)
    capped = valid(eng.search(BENEFIT_QUERY, scope_of(version), search_config(fused_candidates=1, ref_max_targets=1)))
    assert any(m["code"] == "EXPANSION_CAP_REACHED" and m["reference"] == "Điều 4" for m in capped["missing"])
    no_refs = valid(eng.search(BENEFIT_QUERY, scope_of(version), search_config(fused_candidates=1, ref_expansion_depth=0)))
    assert "Điều 4. Loại trừ" not in [e["location"]["clause"] for e in no_refs["evidence"]]


def test_source_warning_travels_with_the_evidence():
    version, rows = index_rows(embedding_config())
    eng, _ = engine(rows)
    result = valid(eng.search(TRUNCATED, scope_of(version), search_config()))
    hit = next(e for e in result["evidence"] if TRUNCATED in e["content"])
    assert any(m["code"] == "SOURCE_WARNING" and m["location"]["pages"] == [4] for m in result["missing"])
    assert "Sản phẩm:" not in hit["content"] and hit["location"]["pages"]


# ---------------------------------------------------------------------------------------------- tool service

class ScopeCore:
    def __init__(self, answer):
        self.answer = answer
        self.calls = []

    def scope(self, ctx, kind, policy_number, *, timeout):
        self.calls.append((kind, policy_number, timeout))
        if isinstance(self.answer, BaseException):
            raise self.answer
        return copy.deepcopy(self.answer)


class Clock:
    def now(self):
        return NOW

    def sleep(self, s):
        pass


EXECUTION = {"limits": {"deadline_at": (NOW + timedelta(seconds=1)).isoformat()}}


def service(answer, rows=None):
    version, built = index_rows(embedding_config())
    eng, _ = engine(rows or built)
    core = ScopeCore(answer(version) if callable(answer) else answer)
    return RetrievalService(core, eng, search_config(), clock=Clock()), core


def test_service_maps_core_answers_to_statuses():
    svc, core = service(lambda v: scope_of(v))
    assert svc.retrieve_public(EXECUTION, "thời gian chờ")["status"] == "OK"
    assert core.calls == [("PUBLIC", None, 1.0)]  # timeout bounded by the run deadline
    svc, _ = service(CoreError("NOT_AUTHORIZED"))
    assert svc.retrieve_public(EXECUTION, "x")["status"] == "DENIED"
    svc, _ = service(CoreError("TIMEOUT"))
    timeout = svc.retrieve_public(EXECUTION, "x")
    assert timeout["status"] == "ERROR" and timeout["error"]["code"] == "SCOPE_UNAVAILABLE"  # not DENIED
    svc, _ = service(lambda v: scope_of(v, expires=NOW - timedelta(seconds=1)))
    assert svc.retrieve_public(EXECUTION, "x")["error"]["code"] == "SCOPE_UNAVAILABLE"


def test_invalid_attempt_propagates_and_scope_kind_must_match():
    svc, _ = service(CoreError("INVALID_ATTEMPT"))
    with pytest.raises(AttemptInvalid):
        svc.retrieve_public(EXECUTION, "x")
    svc, _ = service(lambda v: scope_of(v))
    assert svc.retrieve_private(EXECUTION, "x", "POL-1")["status"] == "ERROR"  # a Public scope never serves Private
