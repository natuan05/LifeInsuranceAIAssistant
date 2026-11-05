"""Corpus preparation (plan Task 7). Fixture text is synthetic; the real Public corpus is read only for inventory,
limits and the UL049 p29 source warning. Passing here proves structure handling, not that the corpus is approved."""
import shutil
import unicodedata

import pytest

from life_agent.corpus import (CorpusError, build_chunks, inventory, prepare_corpus, prepare_document, resolve_refs,
                               section_key_of)

from corpus_fixtures import TRUNCATED, corpus_config, fixture_manifest, public_manifest


def prepared(**cfg):
    manifest, source = fixture_manifest()
    return prepare_document(source, manifest, corpus_config(**cfg))


def chunks_of(version):
    return resolve_refs(build_chunks(version)).chunks


def children(chunks, section=None):
    return [c for c in chunks if c.kind == "child" and (section is None or c.section_key == section)]


# ---------------------------------------------------------------------------------------------- inventory / sources

def test_public_inventory_matches_the_decided_scope():
    inv = inventory(public_manifest())
    assert (inv["sources"], inv["pages"], inv["products"], inv["main"], inv["rider"]) == (13, 243, 7, 4, 3)
    assert (inv["terms_and_conditions"], inv["important_note"]) == (8, 5)
    assert inv["human_approved"] is False  # G5 not passed: trial use only
    assert len(inv["xanh_uoc_mo_options"]) == 2  # UL049 and ULP50 are two options of one product


def test_changed_markdown_is_refused_by_checksum(tmp_path):
    manifest, source = fixture_manifest()
    copy_root = tmp_path / "repo"
    target = copy_root / source["output_markdown"]
    target.parent.mkdir(parents=True)
    shutil.copy(__import__("corpus_fixtures").FIXTURE_MD, target)
    target.write_text(target.read_text(encoding="utf-8") + "\nThêm một dòng.\n", encoding="utf-8")
    with pytest.raises(CorpusError, match="checksum"):
        prepare_document(source, manifest, corpus_config(), repo_root=copy_root)


def test_unapproved_source_needs_the_explicit_trial_flag():
    manifest, source = fixture_manifest()
    with pytest.raises(CorpusError, match="human-approved"):
        prepare_document(source, manifest, corpus_config(allow_unapproved=False))
    version = prepare_document(source, manifest, corpus_config())
    assert version.approval == {"status": "synthetic_fixture/needs_human_review", "human_approved": False}


# ---------------------------------------------------------------------------------------------- structure

def test_nfc_page_anchors_and_repeated_footer_removed():
    version = prepared()
    text = "\n".join(b.text for b in version.blocks)
    assert text == unicodedata.normalize("NFC", text)
    assert version.boilerplate_removed == 4 and "Sản phẩm mô phỏng – Trang" not in text
    chunks = chunks_of(version)
    waiting = children(chunks, "dieu-3")[0]
    assert waiting.pages == [3] and waiting.anchor == "pdf-page-3"
    assert {c.section_key for c in chunks} >= {"dieu-1", "dieu-3", "dieu-4", "dieu-7", "dieu-7~2", "phu-luc-1"}
    assert not any(c.section_key.startswith("chuong-") for c in chunks)  # heading-only chapter: no empty passage


def test_table_split_repeats_header_and_continuation_stays_with_its_article():
    chunks = chunks_of(prepared())
    tables = [c for c in children(chunks, "dieu-1") if "| STT |" in c.content]
    assert len(tables) >= 2
    for c in tables:
        lines = c.content.split("\n")
        start = lines.index("| STT | Nhóm bệnh | Số ngày tối đa |")
        assert lines[start + 1] == "|---|---|---|"
    continuation = next(c for c in tables if "tiếp trang" in c.content)
    assert continuation.section_key == "dieu-1" and 3 in continuation.pages


def test_long_definition_is_split_at_sentence_boundaries():
    cfg = corpus_config()
    parts = children(chunks_of(prepared()), "phu-luc-1")
    assert len(parts) > 1
    for c in parts:
        assert len(c.content) <= cfg.child_max_chars + 100
        assert c.content.rstrip().endswith((".", "Hợp Đồng")), c.content[-40:]


def test_condition_and_exclusion_keep_their_link_through_parent_and_refs():
    chunks = chunks_of(prepared())
    benefit = children(chunks, "dieu-1")
    assert len({c.parent_key for c in benefit}) == 1
    parent = next(c for c in chunks if c.chunk_key == benefit[0].parent_key)
    assert "thời gian chờ" in parent.content and "loại trừ" in parent.content
    refs = {r["raw"]: r for c in benefit for r in c.refs}
    assert refs["Điều 3"]["status"] == "RESOLVED" and refs["Điều 4"]["target_section_key"] == "dieu-4"


def test_prefix_is_context_only_and_never_part_of_quoted_content():
    chunk = children(chunks_of(prepared()), "dieu-3")[0]
    assert chunk.prefix.startswith("Sản phẩm: Dự Phòng Xanh")
    assert "Mục: Chương I. Quyền lợi > Điều 3. Thời gian chờ" in chunk.prefix
    assert "Sản phẩm:" not in chunk.content and chunk.embedding_text.startswith(chunk.prefix)
    assert chunk.chunk_type == "WAITING_PERIOD"


# ---------------------------------------------------------------------------------------------- references

def test_reference_states_missing_external_ambiguous_vague_and_toc():
    chunks = chunks_of(prepared())
    refs = {(c.section_key, r["raw"]): r for c in children(chunks) for r in c.refs}
    assert refs[("dieu-1", "Điều 9")]["status"] == "TARGET_MISSING"
    assert refs[("dieu-1", "Điều 5")]["reason"] == "CROSS_DOCUMENT"  # "của Luật ..." is another document
    assert refs[("dieu-7~2", "Điều 7")]["reason"] == "AMBIGUOUS_TARGET"  # two sections share the key
    assert refs[("dieu-4", "như trên")]["reason"] == "AMBIGUOUS_PHRASE"
    intro = [r for c in children(chunks) if c.section_key.startswith("s000") for r in c.refs]
    assert intro == []  # table-of-contents lines are not references


def test_rechunking_changes_chunk_ids_but_reference_targets_stay():
    a, b = chunks_of(prepared()), chunks_of(prepared(child_target_chars=300, child_max_chars=450, child_min_chars=100,
                                                     config_id="test-structure-v2"))
    assert {c.chunk_key for c in a} != {c.chunk_key for c in b}
    targets = lambda cs: {(c.section_key, r["raw"], r["target_section_key"]) for c in children(cs) for r in c.refs
                          if r["status"] == "RESOLVED"}
    assert targets(a) == targets(b)


def test_section_keys():
    assert section_key_of("Điều 12. Chấm dứt") == "dieu-12"
    assert section_key_of("Phụ lục 1.1. Bệnh Lý") == "phu-luc-1.1"
    assert section_key_of("Chương II.") == "chuong-ii"
    assert section_key_of("Giới thiệu") is None


# ---------------------------------------------------------------------------------------------- source warnings

def test_truncated_source_text_carries_a_warning_and_is_not_completed():
    chunks = chunks_of(prepared())
    flagged = [c for c in chunks if c.issues]
    assert flagged and all(TRUNCATED in c.content for c in flagged)
    assert all(c.issues[0]["code"] == "SOURCE_WARNING" and 4 in c.pages for c in flagged)
    note_chunk = next(c for c in flagged if c.kind == "child")
    assert "Ghi chú hiệu đính" not in note_chunk.content  # editorial note kept apart from source text
    assert any("không suy đoán" in n for n in note_chunk.editorial_notes)


def test_ul049_page_29_warning_on_the_real_corpus():
    manifest = public_manifest()
    source = next(s for s in manifest["sources"] if s["source_relative_path"].endswith("UL049.pdf"))
    version = prepare_document(source, manifest, corpus_config())
    flagged = [c for c in chunks_of(version) if c.kind == "child" and c.issues]
    assert len(flagged) == 1 and flagged[0].pages == [29]
    content = flagged[0].content
    assert "Giá Trị Tài Khoản Hợp Đồng\n\n" in content or content.rstrip().endswith("Giá Trị Tài Khoản Hợp Đồng")
    assert "Hợp Đồng đủ để khấu trừ Khoản Khấu Trừ Hàng Tháng" not in content  # not completed from ULP50
    assert version.approval["status"] == "ai_checked/needs_source_review"


def test_real_corpus_chunks_respect_limits_and_carry_location():
    cfg = corpus_config(child_target_chars=1000, child_max_chars=1500, child_min_chars=300, parent_max_chars=6000)
    for version, report in prepare_corpus(public_manifest(), cfg):
        assert report.chunks, version.source["relative_path"]
        for c in report.chunks:
            assert c.pages and c.anchor and c.content
            if c.kind == "parent":
                assert len(c.content) <= 8000
            elif "<table" not in c.content:
                assert len(c.content) <= cfg.child_max_chars + 2 * cfg.child_max_chars  # long single rows/blocks
        assert version.approval["human_approved"] is False
