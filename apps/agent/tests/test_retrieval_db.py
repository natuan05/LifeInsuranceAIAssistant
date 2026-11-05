"""PostgreSQL + pgvector tests with the real roles (plan Task 8 Step 1/3/7): offline indexer writes, read-only
retrieval role searches. Synthetic fixture rows only, removed after each test. Skipped when the two DSNs are absent:
LIFE_AGENT_TEST_RAG_INDEXER_DSN and LIFE_AGENT_TEST_RAG_RETRIEVER_DSN (environment or apps/agent/.env)."""
import dataclasses
import json
import uuid

import pytest

from life_agent import contracts
from life_agent.config import load_env
from life_agent.corpus import CorpusError, PgIndexWriter, build_chunks, index_version, prepare_document, resolve_refs
from life_agent.retrieval import PgIndexReader, SearchEngine

from corpus_fixtures import corpus_config, fixture_manifest
from rag_fakes import HashEmbedding, embedding_config
from test_retrieval import scope_of, search_config

ENV = load_env()
INDEXER = ENV.get("LIFE_AGENT_TEST_RAG_INDEXER_DSN")
RETRIEVER = ENV.get("LIFE_AGENT_TEST_RAG_RETRIEVER_DSN")
pytestmark = pytest.mark.skipif(not (INDEXER and RETRIEVER), reason="RAG test database DSNs not configured")


@pytest.fixture
def documents():
    created: list[str] = []
    yield created
    import psycopg

    with psycopg.connect(INDEXER) as conn:
        conn.execute("DELETE FROM rag.rag_knowledge_chunks WHERE document_id = ANY(%s::uuid[])", (created,))


def make_version(documents, *, document_id=None, label="fixture-v1", **cfg):
    manifest, source = fixture_manifest()
    doc = document_id or str(uuid.uuid4())
    if doc not in documents:
        documents.append(doc)
    return prepare_document(source, manifest, corpus_config(**cfg), catalog={"document_id": doc, "document_version": label})


def writer(embedder=None, cfg=None):
    return PgIndexWriter(INDEXER, embedder or HashEmbedding(), cfg or embedding_config())


def engine(cfg=None, embedder=None):
    reader = PgIndexReader(RETRIEVER)
    return SearchEngine(reader, embedder or HashEmbedding(), cfg or embedding_config()), reader


def rows_of(document_id):
    import psycopg

    with psycopg.connect(INDEXER) as conn:
        return conn.execute("SELECT document_version, metadata->>'fingerprint', count(*) FROM rag.rag_knowledge_chunks "
                            "WHERE document_id = %s GROUP BY 1, 2 ORDER BY 1", (document_id,)).fetchall()


def insert_private(version, policy_id, owner_id):
    """Private rows written through the offline writer (same path as `python -m life_agent.corpus --private-fixture`)."""
    private = dataclasses.replace(version, access_scope="PRIVATE_POLICY", policy_id=policy_id, owner_customer_id=owner_id)
    return index_version(private, writer())


# ---------------------------------------------------------------------------------------------- scope

def test_same_content_other_version_is_never_returned(documents):
    v1 = make_version(documents)
    v2 = make_version(documents, document_id=v1.document_id, label="fixture-v2")
    for v in (v1, v2):
        index_version(v, writer())
    eng, reader = engine()
    try:
        result = contracts.validate("RetrievalResult", eng.search("quyền lợi nằm viện thời gian chờ", scope_of(v1),
                                                                  search_config()))
    finally:
        reader.close()
    assert result["status"] == "OK" and eng.last_trace["keyword"] and eng.last_trace["vector"]
    assert {e["document_version"] for e in result["evidence"]} == {"fixture-v1"}  # newer version does not replace it
    # ref expansion in the same scope; when equal-score rows (ties ordered by row id) fill the cap first, the ref is
    # reported as cut instead of silently dropped
    assert any(e["location"]["clause"] == "Điều 4. Loại trừ" for e in result["evidence"]) or \
        ("EXPANSION_CAP_REACHED", "Điều 4") in {(m["code"], m.get("reference")) for m in result["missing"]}


def test_scope_filter_applies_before_candidate_caps(documents):
    granted = make_version(documents)
    others = [make_version(documents) for _ in range(3)]
    for v in [granted, *others]:
        index_version(v, writer())
    eng, reader = engine()
    try:
        result = eng.search("thời gian chờ", scope_of(granted), search_config(keyword_candidates=1, vector_candidates=1))
    finally:
        reader.close()
    assert result["status"] == "OK"
    assert {e["document_id"] for e in result["evidence"]} == {granted.document_id}


def test_private_pairs_are_checked_with_policy(documents):
    shared_doc = str(uuid.uuid4())
    documents.append(shared_doc)
    mine = make_version(documents, document_id=shared_doc)
    insert_private(mine, policy_a := str(uuid.uuid4()), str(uuid.uuid4()))
    insert_private(make_version(documents, document_id=shared_doc, label="fixture-other"), str(uuid.uuid4()),
                   str(uuid.uuid4()))
    scope = scope_of(mine, kind="PRIVATE")
    scope["policy_number"] = "SYN-POLICY-A"
    scope["documents"][0]["policy_id"] = policy_a
    wrong = json.loads(json.dumps(scope))
    wrong["documents"][0]["policy_id"] = str(uuid.uuid4())  # same document/version, another policy
    eng, reader = engine()
    try:
        ok = contracts.validate("RetrievalResult", eng.search("thời gian chờ", scope, search_config()))
        other = eng.search("thời gian chờ", wrong, search_config())
    finally:
        reader.close()
    assert ok["status"] == "OK" and {e["document_version"] for e in ok["evidence"]} == {"fixture-v1"}
    assert other["status"] == "ERROR"  # nothing indexed for that pair: never falls back to another policy's rows


def test_synthetic_contract_indexed_by_writer_is_found_only_with_its_policy(documents):
    from life_agent.corpus import SYNTHETIC_FIXTURE, prepare_private_fixture

    version = prepare_private_fixture(SYNTHETIC_FIXTURE, corpus_config())
    documents.append(version.document_id)
    receipt = index_version(version, writer())
    assert receipt.chunks_written > 0 and index_version(version, writer()).skipped
    import psycopg

    with psycopg.connect(INDEXER) as conn:
        rows = conn.execute("SELECT DISTINCT access_scope, policy_id::text, owner_customer_id::text, page_number "
                            "FROM rag.rag_knowledge_chunks WHERE document_id = %s", (version.document_id,)).fetchall()
    assert rows == [("PRIVATE_POLICY", version.policy_id, version.owner_customer_id, None)]
    scope = scope_of(version, kind="PRIVATE")
    scope["policy_number"] = "SYN-POL-2024-0001"
    scope["documents"][0]["policy_id"] = version.policy_id
    public = scope_of(version)  # same pair asked as Public: never matches Private rows
    foreign = json.loads(json.dumps(scope))
    foreign["documents"][0]["policy_id"] = str(uuid.uuid4())
    eng, reader = engine()
    try:
        ok = contracts.validate("RetrievalResult", eng.search("hạn mức nội trú DEMO-TITAN", scope, search_config()))
        as_public = eng.search("hạn mức nội trú DEMO-TITAN", public, search_config())
        other = eng.search("hạn mức nội trú DEMO-TITAN", foreign, search_config())
    finally:
        reader.close()
    assert ok["status"] == "OK" and {e["location"].get("anchor") for e in ok["evidence"]} & {"syn-benefits"}
    assert all("pages" not in e["location"] for e in ok["evidence"])
    assert as_public["evidence"] == [] and other["evidence"] == []


# ---------------------------------------------------------------------------------------------- roles

def test_retrieval_role_only_reads_rag():
    import psycopg

    with psycopg.connect(RETRIEVER) as conn:
        conn.execute("SELECT count(*) FROM rag.rag_knowledge_chunks").fetchone()
        for sql in ("DELETE FROM rag.rag_knowledge_chunks WHERE false", "SELECT 1 FROM business.users LIMIT 1"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(sql)
            conn.rollback()


# ---------------------------------------------------------------------------------------------- indexing

def test_index_write_is_atomic_and_deduplicated(documents):
    version = make_version(documents)
    first = index_version(version, writer())
    assert not first.skipped and rows_of(version.document_id)[0][2] == first.chunks_written
    assert index_version(version, writer()).skipped  # same checksum/dataset/config/model: not loaded twice
    changed = dataclasses.replace(version, dataset_version="test-dataset-2",
                                  corpus_config=dataclasses.replace(version.corpus_config, dataset_version="test-dataset-2"))
    with pytest.raises(Exception):
        index_version(changed, writer(HashEmbedding(fail_with="UNAVAILABLE")))
    assert rows_of(version.document_id) == [("fixture-v1", first.fingerprint, first.chunks_written)]
    broken = resolve_refs(build_chunks(changed)).chunks
    broken[-1].pages = [0]  # violates chunk_page_valid in the middle of the insert
    with pytest.raises(Exception):
        writer().write_version(changed, broken)
    assert rows_of(version.document_id) == [("fixture-v1", first.fingerprint, first.chunks_written)]  # no partial
    second = index_version(changed, writer())
    assert rows_of(version.document_id) == [("fixture-v1", second.fingerprint, second.chunks_written)]


def test_embedding_identity_mismatch_writes_nothing(documents):
    version = make_version(documents)
    with pytest.raises(CorpusError):
        index_version(version, writer(HashEmbedding(identity_override={"model_version": "2"})))
    assert rows_of(version.document_id) == []


def test_index_in_another_vector_space_is_refused_at_search(documents):
    version = make_version(documents)
    index_version(version, writer(cfg=embedding_config("fake-hash-64.other")))
    eng, reader = engine()
    try:
        result = eng.search("thời gian chờ", scope_of(version), search_config())
    finally:
        reader.close()
    assert result["error"]["code"] == "EMBEDDING_INCOMPATIBLE"


def test_embedding_outage_uses_keyword_only_on_real_sql(documents):
    version = make_version(documents)
    index_version(version, writer())
    eng, reader = engine(embedder=HashEmbedding(fail_with="TIMEOUT"))
    try:
        result = eng.search("thời gian chờ", scope_of(version), search_config())
    finally:
        reader.close()
    assert result["status"] == "OK" and result["degraded"] is True and eng.last_trace["vector"] == []
