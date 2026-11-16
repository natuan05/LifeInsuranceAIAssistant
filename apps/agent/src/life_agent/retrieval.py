"""Hybrid retrieval with Core scope (plan Task 8; Agent_Design #hybrid-retrieval, #embedding-fallback,
#rag-retrieval-statuses, #rag-result-envelope, #parent-child-chunking, #cross-references).

- Scope is Core's DocumentScope: exact document/version pairs (plus policy for Private). Every SQL statement — keyword,
  vector, row fetch, parent and reference expansion — joins those pairs before ranking or capping.
- PostgreSQL full-text search + pgvector + Reciprocal Rank Fusion. No BM25. FTS config, query mode, candidate counts,
  RRF constant and expansion caps come from a versioned SearchConfig; none is an approved default.
- Embedding outage -> keyword-only with degraded=true. Keyword/database failure -> ERROR (vector-only is not chosen).
- Query vector identity (model/version/dims/config) must match the index rows in scope before any comparison.
- missing[]/conflicts[] carry structural/source issues only; sufficiency is the Agent node's job.
Runtime uses the read-only retrieval role; it never writes the index and never reads business tables.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, fields
from typing import Any, Callable, Mapping, Protocol, Sequence

from . import contracts
from .config import parse_timestamp
from .core_client import Clock, CoreError, SystemClock
from .store import AttemptInvalid


class SearchUnavailable(Exception):
    """Index/database failure (filtered)."""


@dataclass(frozen=True)
class SearchConfig:
    config_id: str
    fts_config: str
    fts_query_mode: str  # "or" | "plain" | "websearch"
    keyword_candidates: int
    vector_candidates: int
    fused_candidates: int
    max_evidence: int
    rrf_k: int
    parent_expansion: bool
    parent_max_chars: int
    ref_expansion_depth: int
    ref_max_targets: int
    max_evidence_chars: int
    statement_timeout_ms: int
    scope_timeout_s: float

    def __post_init__(self) -> None:
        for f in fields(self):
            if getattr(self, f.name) is None:
                raise ValueError(f"{f.name} is required")
        if self.fts_query_mode not in ("or", "plain", "websearch"):
            raise ValueError("unknown fts_query_mode")
        if not re.fullmatch(r"[a-z_]+", self.fts_config):
            raise ValueError("fts_config must be a text search configuration name")
        if self.ref_expansion_depth not in (0, 1):
            raise ValueError("only one reference hop is supported")
        if not 1 <= self.max_evidence <= 20:
            raise ValueError("max_evidence must be 1..20 (RetrievalResult cap)")

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any]) -> "SearchConfig":
        names = [f.name for f in fields(cls)]
        missing = [n for n in names if n not in data]
        if missing:
            raise ValueError("search config missing: " + ", ".join(missing))
        return cls(**{n: data[n] for n in names})


@dataclass(frozen=True)
class ScopePair:
    document_id: str
    document_version: str
    policy_id: str | None


@dataclass
class Row:
    id: str
    document_id: str
    document_version: str
    content: str
    metadata: dict[str, Any]


class IndexReader(Protocol):
    """Scoped read access to rag. Every method receives the pairs and must apply them in SQL."""

    def profile(self, pairs: Sequence[ScopePair], access_scope: str) -> dict[tuple[str, str], list[dict[str, Any]]]:
        """(document, version) -> complete embedding identities plus stored_dimensions of child rows."""

    def keyword(self, query: str, pairs: Sequence[ScopePair], access_scope: str, config: SearchConfig) -> list[str]: ...

    def vector(self, values: Sequence[float], embedding_identity: Mapping[str, Any], pairs: Sequence[ScopePair], access_scope: str,
               config: SearchConfig) -> list[str]: ...

    def rows(self, ids: Sequence[str], pairs: Sequence[ScopePair], access_scope: str) -> dict[str, Row]: ...

    def parents(self, keys: Sequence[str], pairs: Sequence[ScopePair], access_scope: str) -> dict[str, Row]: ...

    def section(self, document_id: str, document_version: str, section_key: str, pairs: Sequence[ScopePair],
                access_scope: str) -> list[Row]: ...


def _result(status: str, *, evidence=(), missing=(), conflicts=(), degraded=False, error=None) -> dict[str, Any]:
    return {"status": status, "evidence": list(evidence), "missing": list(missing), "conflicts": list(conflicts),
            "degraded": degraded, "error": error}


def _error(code: str, retryable: bool) -> dict[str, Any]:
    return _result("ERROR", error={"code": code, "retryable": retryable})


def rrf(rankings: Sequence[Sequence[str]], k: int) -> list[tuple[str, float]]:
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, item in enumerate(ranking, start=1):
            scores[item] = scores.get(item, 0.0) + 1.0 / (k + rank)
    return sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))


def query_terms(query: str) -> list[str]:
    return list(dict.fromkeys(t for t in re.findall(r"\w+", query.lower()) if t))


class SearchEngine:
    """Shared engine for Public and Private retrieval."""

    def __init__(self, index: IndexReader, embedder: Any, embedding_config: Any) -> None:
        self._index = index
        self._embedder = embedder
        self._embedding = embedding_config
        self.last_trace: dict[str, Any] = {}

    def search(self, query: str, scope: Mapping[str, Any], config: SearchConfig) -> dict[str, Any]:
        """query + Core DocumentScope -> RetrievalResult (six fields)."""
        self.last_trace = {"degraded": False}
        if scope["decision"] == "DENIED":
            return _result("DENIED")
        access = "PUBLIC" if scope["kind"] == "PUBLIC" else "PRIVATE_POLICY"
        pairs = [ScopePair(d["document_id"], d["document_version"], d["policy_id"]) for d in scope["documents"]]
        if not pairs:
            return _result("NO_SOURCE")
        try:
            profile = self._index.profile(pairs, access)
        except SearchUnavailable:
            return _error("SEARCH_UNAVAILABLE", True)
        indexed = [p for p in pairs if (p.document_id, p.document_version) in profile]
        if not indexed:
            return _error("SEARCH_UNAVAILABLE", False)
        expected = {**self._embedding.identity(), "stored_dimensions": self._embedding.dimensions}
        if any(identity != expected for p in indexed for identity in profile[(p.document_id, p.document_version)]):
            return _error("EMBEDDING_INCOMPATIBLE", False)  # never compare vectors from different spaces
        missing = [{"code": "SOURCE_WARNING", "document_id": p.document_id, "document_version": p.document_version,
                    "reason": "Tài liệu trong phạm vi chưa được lập chỉ mục tìm kiếm."}
                   for p in pairs if p not in indexed]

        degraded, vector_ids = False, []
        try:
            vector = self._embedder.embed_query(query, self._embedding)
        except Exception as error:  # noqa: BLE001 - only provider outages fall back
            if getattr(error, "outage", False):
                degraded = True
                vector = None
            else:
                return _error("INTERNAL", False)
        if vector is not None and {k: vector[k] for k in self._embedding.identity()} != self._embedding.identity():
            return _error("EMBEDDING_INCOMPATIBLE", False)
        try:
            keyword_ids = self._index.keyword(query, indexed, access, config)
            if vector is not None:
                vector_ids = self._index.vector(vector["values"], self._embedding.identity(), indexed, access, config)
        except SearchUnavailable:
            return _error("SEARCH_UNAVAILABLE", True)
        fused = rrf([keyword_ids, vector_ids], config.rrf_k)[: config.fused_candidates]
        self.last_trace = {"degraded": degraded, "keyword": keyword_ids, "vector": vector_ids,
                           "fused": [i for i, _ in fused]}
        if not fused:
            return _result("NO_MATCH", degraded=degraded)
        try:
            evidence, issues = self._assemble([i for i, _ in fused], indexed, access, config)
        except SearchUnavailable:
            return _error("SEARCH_UNAVAILABLE", True)
        if not evidence:
            return _result("NO_MATCH", degraded=degraded)
        return _result("OK", evidence=evidence, missing=(missing + issues)[:20], degraded=degraded)

    # ------------------------------------------------------------------ evidence assembly

    def _assemble(self, ranked: list[str], pairs: list[ScopePair], access: str, config: SearchConfig
                  ) -> tuple[list[dict], list[dict]]:
        rows = self._index.rows(ranked, pairs, access)
        children = [rows[i] for i in ranked if i in rows]
        parents: dict[str, Row] = {}
        if config.parent_expansion:
            keys = list(dict.fromkeys(r.metadata["parent_key"] for r in children if r.metadata.get("parent_key")))
            parents = self._index.parents(keys, pairs, access)
        evidence, issues, used_chars = [], [], 0
        emitted_parents: set[str] = set()
        seen_content: set[str] = set()
        emitted_keys: set[str] = set()
        chosen_rows: list[Row] = []
        for child in children:
            if len(evidence) >= config.max_evidence:
                break
            parent = parents.get(child.metadata.get("parent_key") or "")
            if parent is not None and parent.metadata["chunk_key"] in emitted_parents:
                continue  # already covered by its parent passage
            unit = parent if parent is not None and len(parent.content) <= config.parent_max_chars else child
            digest = hashlib.sha256(unit.content.encode()).hexdigest()
            if digest in seen_content:
                continue
            if evidence and used_chars + len(unit.content) > config.max_evidence_chars:
                if unit is parent and used_chars + len(child.content) <= config.max_evidence_chars:
                    unit = child
                    digest = hashlib.sha256(unit.content.encode()).hexdigest()
                else:
                    continue
            seen_content.add(digest)
            if unit is parent:
                emitted_parents.add(parent.metadata["chunk_key"])
            evidence.append(_evidence(unit))
            chosen_rows.append(unit)
            emitted_keys.add(unit.metadata["chunk_key"])
            used_chars += len(unit.content)
            issues.extend(_source_issues(unit))
        issues.extend(self._expand_refs(chosen_rows, pairs, access, config, evidence, emitted_keys,
                                        seen_content, used_chars))
        return evidence, _dedupe(issues)

    def _expand_refs(self, chosen: list[Row], pairs: list[ScopePair], access: str, config: SearchConfig,
                     evidence: list[dict], emitted_keys: set[str], seen: set[str], used_chars: int
                     ) -> list[dict]:
        issues: list[dict] = []
        in_scope = {(p.document_id, p.document_version) for p in pairs}
        # Only all emitted parent parts prove coverage of an entire target section.
        complete = {(r.document_id, r.document_version, r.metadata["section_key"])
                    for r in chosen if r.metadata.get("section_parent_keys")
                    and set(r.metadata["section_parent_keys"]) <= emitted_keys}
        targets: list[tuple[str, str, str, str, Row]] = []
        for row in chosen:
            for ref in row.metadata.get("refs") or []:
                if ref["status"] == "RESOLVED":
                    key = (ref["target_document_id"], ref["target_document_version"], ref["target_section_key"])
                    if key[:2] not in in_scope:
                        issues.append(_issue("REFERENCE_OUT_OF_SCOPE", row, ref["raw"],
                                             "Đích tham chiếu nằm ngoài phạm vi tài liệu được cấp."))
                    elif key not in complete and key not in [t[:3] for t in targets]:
                        targets.append((*key, ref["raw"], row))
                elif ref["status"] == "TARGET_MISSING":
                    issues.append(_issue("REFERENCE_TARGET_MISSING", row, ref["raw"],
                                         "Không tìm thấy mục được dẫn chiếu trong tài liệu này."))
                else:
                    issues.append(_issue("UNRESOLVED_REFERENCE", row, ref["raw"],
                                         _UNRESOLVED_REASON.get(ref.get("reason"), "Tham chiếu chưa được phân giải.")))
        if config.ref_expansion_depth == 0:
            issues.extend(_issue("EXPANSION_CAP_REACHED", origin, raw, "Chưa mở rộng tham chiếu theo cấu hình thử.")
                          for _, _, _, raw, origin in targets)
            return issues
        expanded = 0
        for doc, ver, section_key, raw, origin in targets:
            if expanded >= config.ref_max_targets or len(evidence) >= config.max_evidence:
                issues.append(_issue("EXPANSION_CAP_REACHED", origin, raw,
                                     "Chưa lấy mục được dẫn chiếu vì đã đạt giới hạn mở rộng."))
                continue
            expanded += 1  # the cap bounds database lookups too, including missing targets
            rows = self._index.section(doc, ver, section_key, pairs, access)
            if not rows:
                issues.append(_issue("REFERENCE_TARGET_MISSING", origin, raw, "Mục được dẫn chiếu không có trong chỉ mục."))
                continue
            rows = [r for r in rows if r.metadata["chunk_key"] not in emitted_keys]
            if not rows:
                continue
            for target in rows:
                digest = hashlib.sha256(target.content.encode()).hexdigest()
                if digest in seen:
                    continue
                if len(evidence) >= config.max_evidence or used_chars + len(target.content) > config.max_evidence_chars:
                    issues.append(_issue("EXPANSION_CAP_REACHED", origin, raw,
                                         "Mục được dẫn chiếu chỉ lấy được một phần do giới hạn ngữ cảnh."))
                    break
                seen.add(digest)
                evidence.append(_evidence(target))
                emitted_keys.add(target.metadata["chunk_key"])
                used_chars += len(target.content)
                issues.extend(_source_issues(target))
        return issues


_UNRESOLVED_REASON = {
    "CROSS_DOCUMENT": "Tham chiếu sang tài liệu khác chưa có ánh xạ phiên bản đã kiểm tra.",
    "AMBIGUOUS_TARGET": "Tham chiếu khớp nhiều mục; chưa xác định được mục đích.",
    "NO_LOCAL_TARGET_KIND": "Tài liệu này không có mục loại được dẫn; có thể dẫn sang tài liệu khác.",
    "AMBIGUOUS_PHRASE": "Tham chiếu mơ hồ trong nguồn chưa xác định được đích.",
}


def _location(row: Row) -> dict[str, Any]:
    meta = row.metadata
    location: dict[str, Any] = {}
    if meta.get("pages"):
        location["pages"] = list(meta["pages"])[:50]
    if meta.get("clause"):
        location["clause"] = meta["clause"][:100]
    if meta.get("anchor"):
        location["anchor"] = meta["anchor"][:200]
    return location or {"anchor": meta["section_key"][:200]}


def _evidence(row: Row) -> dict[str, Any]:
    return {"evidence_id": row.metadata["evidence_key"], "document_id": row.document_id,
            "document_version": row.document_version, "title": row.metadata["title"][:255],
            "document_type": row.metadata["doc_type"], "location": _location(row), "content": row.content[:8000]}


def _issue(code: str, row: Row, reference: str | None, reason: str) -> dict[str, Any]:
    item = {"code": code, "document_id": row.document_id, "document_version": row.document_version,
            "location": _location(row), "reason": reason[:300]}
    if reference:
        item["reference"] = reference[:200]
    return item


def _source_issues(row: Row) -> list[dict]:
    return [_issue("SOURCE_WARNING", row, None, issue.get("reason") or "Nguồn có vấn đề cần kiểm tra.")
            for issue in row.metadata.get("issues") or []]


def _dedupe(items: list[dict]) -> list[dict]:
    out, seen = [], set()
    for item in items:
        key = (item["code"], item["document_id"], item["document_version"], item.get("reference"), item["reason"])
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out


# ---------------------------------------------------------------------------------------------- PostgreSQL

_SCOPE_JOIN = ("JOIN unnest(%(docs)s::uuid[], %(vers)s::text[], %(pols)s::uuid[]) AS s(document_id, document_version, "
               "policy_id) ON c.document_id = s.document_id AND c.document_version = s.document_version "
               "AND c.policy_id IS NOT DISTINCT FROM s.policy_id")
_TEXT = "coalesce(c.metadata->>'prefix', '') || ' ' || c.content"


class PgIndexReader:
    """IndexReader over rag.rag_knowledge_chunks with the read-only retrieval role. Parameterised SQL only; the scope
    join is part of every statement; each search runs in a READ ONLY transaction with a statement timeout."""

    def __init__(self, dsn: str, *, connect: Callable[..., Any] | None = None) -> None:
        self._dsn = dsn
        self._connect = connect
        self._conn = None

    def _connection(self):
        if self._conn is None or self._conn.closed:
            if self._connect:
                self._conn = self._connect()
            else:
                import psycopg

                self._conn = psycopg.connect(self._dsn, connect_timeout=5)
        return self._conn

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()

    def _query(self, sql: str, params: Mapping[str, Any], timeout_ms: int = 5000) -> list[tuple]:
        try:
            conn = self._connection()
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute("SET TRANSACTION READ ONLY")
                    cur.execute("SELECT set_config('statement_timeout', %s, true)", (str(int(timeout_ms)),))
                    cur.execute(sql, params)
                    return cur.fetchall()
        except Exception as error:  # noqa: BLE001 - filtered: never surface SQL or payloads
            if self._conn is not None and not getattr(self._conn, "closed", True):
                try:
                    self._conn.rollback()
                except Exception:  # noqa: BLE001
                    self._conn = None
            raise SearchUnavailable(type(error).__name__) from None

    @staticmethod
    def _params(pairs: Sequence[ScopePair], access: str, **extra: Any) -> dict[str, Any]:
        return {"docs": [p.document_id for p in pairs], "vers": [p.document_version for p in pairs],
                "pols": [p.policy_id for p in pairs], "access": access, **extra}

    def profile(self, pairs, access_scope):
        rows = self._query(f"SELECT c.document_id::text, c.document_version, c.metadata->'embedding', vector_dims(c.embedding) "
                           f"FROM rag.rag_knowledge_chunks c {_SCOPE_JOIN} "
                           f"WHERE c.access_scope = %(access)s AND c.metadata->>'kind' = 'child' GROUP BY 1, 2, 3, 4",
                           self._params(pairs, access_scope))
        out: dict[tuple[str, str], list[dict[str, Any]]] = {}
        for doc, ver, identity, dimensions in rows:
            out.setdefault((doc, ver), []).append({**(identity or {}), "stored_dimensions": dimensions})
        return out

    def keyword(self, query, pairs, access_scope, config):
        terms = query_terms(query)
        if not terms:
            return []
        if config.fts_query_mode == "or":
            tsquery, fn = " | ".join(terms), "to_tsquery"
        else:
            tsquery, fn = query, "plainto_tsquery" if config.fts_query_mode == "plain" else "websearch_to_tsquery"
        sql = (f"SELECT c.id::text FROM rag.rag_knowledge_chunks c {_SCOPE_JOIN}, "
               f"{fn}(%(cfg)s::regconfig, %(q)s) AS q(query) "
               f"WHERE c.access_scope = %(access)s AND c.metadata->>'kind' = 'child' "
               f"AND to_tsvector(%(cfg)s::regconfig, {_TEXT}) @@ q.query "
               f"ORDER BY ts_rank_cd(to_tsvector(%(cfg)s::regconfig, {_TEXT}), q.query) DESC, c.id LIMIT %(n)s")
        rows = self._query(sql, self._params(pairs, access_scope, cfg=config.fts_config, q=tsquery,
                                             n=config.keyword_candidates), config.statement_timeout_ms)
        return [r[0] for r in rows]

    def vector(self, values, embedding_identity, pairs, access_scope, config):
        import json

        literal = "[" + ",".join(repr(float(v)) for v in values) + "]"
        sql = (f"SELECT c.id::text FROM rag.rag_knowledge_chunks c {_SCOPE_JOIN} "
               f"WHERE c.access_scope = %(access)s AND c.metadata->>'kind' = 'child' "
               f"AND c.metadata->'embedding' = %(emb)s::jsonb "
               f"AND vector_dims(c.embedding) = %(dims)s "
               f"ORDER BY c.embedding <=> %(vec)s::vector, c.id LIMIT %(n)s")
        rows = self._query(sql, self._params(pairs, access_scope, emb=json.dumps(embedding_identity), dims=len(values), vec=literal,
                                             n=config.vector_candidates), config.statement_timeout_ms)
        return [r[0] for r in rows]

    def _fetch(self, where: str, params: dict[str, Any]) -> list[Row]:
        rows = self._query(f"SELECT c.id::text, c.document_id::text, c.document_version, c.content, c.metadata "
                           f"FROM rag.rag_knowledge_chunks c {_SCOPE_JOIN} WHERE c.access_scope = %(access)s AND {where} "
                           f"ORDER BY c.chunk_index", params)
        return [Row(*r) for r in rows]

    def rows(self, ids, pairs, access_scope):
        if not ids:
            return {}
        return {r.id: r for r in self._fetch("c.id = ANY(%(ids)s::uuid[])", self._params(pairs, access_scope, ids=list(ids)))}

    def parents(self, keys, pairs, access_scope):
        if not keys:
            return {}
        rows = self._fetch("c.metadata->>'kind' = 'parent' AND c.metadata->>'chunk_key' = ANY(%(keys)s::text[])",
                           self._params(pairs, access_scope, keys=list(keys)))
        return {r.metadata["chunk_key"]: r for r in rows}

    def section(self, document_id, document_version, section_key, pairs, access_scope):
        return self._fetch("c.metadata->>'kind' = 'parent' AND c.document_id = %(doc)s::uuid "
                           "AND c.document_version = %(ver)s AND c.metadata->>'section_key' = %(key)s",
                           self._params(pairs, access_scope, doc=document_id, ver=document_version, key=section_key))


# ---------------------------------------------------------------------------------------------- tools

class RetrievalService:
    """The two retrieval tools behind the graph's RetrievalTools protocol. Scope always comes from Core; the model's
    query and policy number only narrow inside it."""

    def __init__(self, core: Any, engine: SearchEngine, config: SearchConfig, *, clock: Clock | None = None) -> None:
        self._core = core
        self._engine = engine
        self._config = config
        self._clock = clock or SystemClock()

    def _scope(self, execution: Mapping[str, Any], kind: str, policy_number: str | None) -> dict[str, Any] | None:
        left = (parse_timestamp(execution["limits"]["deadline_at"]) - self._clock.now()).total_seconds()
        if left <= 0:
            return None
        try:
            scope = self._core.scope(execution, kind, policy_number, timeout=min(self._config.scope_timeout_s, left))
        except CoreError as error:
            if error.code == "INVALID_ATTEMPT":
                raise AttemptInvalid() from None
            if error.code == "NOT_AUTHORIZED":
                return {"decision": "DENIED", "kind": kind, "policy_number": policy_number, "reason": "NOT_AUTHORIZED"}
            return None
        scope = contracts.validate("DocumentScope", scope)
        if scope["decision"] == "DENIED" and scope["reason"] == "ATTEMPT_INVALID":
            raise AttemptInvalid()
        if scope["kind"] != kind or (kind == "PRIVATE" and scope["policy_number"] != policy_number):
            return None
        if scope["decision"] == "GRANTED" and parse_timestamp(scope["expires_at"]) <= self._clock.now():
            return None
        return scope

    def _run(self, execution, kind, query, policy_number) -> dict[str, Any]:
        scope = self._scope(execution, kind, policy_number)
        if scope is None:
            return _error("SCOPE_UNAVAILABLE", True)
        return contracts.validate("RetrievalResult", self._engine.search(query, scope, self._config))

    def retrieve_public(self, execution: Mapping[str, Any], query: str) -> dict[str, Any]:
        return self._run(execution, "PUBLIC", query, None)

    def retrieve_private(self, execution: Mapping[str, Any], query: str, policy_number: str) -> dict[str, Any]:
        return self._run(execution, "PRIVATE", query, policy_number)
