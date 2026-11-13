"""Small synthetic corpus fixture (self-written text, no real or masked contract) and shared corpus configs."""
from __future__ import annotations

import copy
import hashlib
from pathlib import Path

from life_agent.corpus import REPO_ROOT, CorpusConfig, load_manifest

FIXTURE_MD = Path(__file__).resolve().parent / "fixtures" / "corpus" / "fixture-tnc.md"
PUBLIC_MANIFEST = REPO_ROOT / "data" / "public" / "manifest-manulife-text.json"
TRUNCATED = "Sản Phẩm Chính tiếp tục có hiệu lực nếu Giá Trị Tài Khoản Hợp Đồng"


def corpus_config(**overrides) -> CorpusConfig:
    values = dict(config_id="test-structure-v1", dataset_version="test-dataset-1", child_target_chars=600,
                  child_max_chars=900, child_min_chars=150, parent_max_chars=4000, boilerplate_min_pages=3,
                  boilerplate_page_ratio=0.6, boilerplate_max_line_chars=80, allow_unapproved=True)
    values.update(overrides)
    return CorpusConfig(**values)


def fixture_manifest(*, approved: bool = False, unresolved: bool = True) -> tuple[dict, dict]:
    source = {
        "source_relative_path": "DuPhongXanh/FIXTURE.pdf", "source_sha256": "a" * 64, "source_page_count": 4,
        "document_title": "Quy tắc sản phẩm mô phỏng FIXTURE (synthetic)", "document_kind": "terms_and_conditions",
        "output_markdown": str(FIXTURE_MD.relative_to(REPO_ROOT)).replace("\\", "/"),
        "output_sha256": hashlib.sha256(FIXTURE_MD.read_bytes()).hexdigest(),
        "status": "approved" if approved else "synthetic_fixture/needs_human_review", "human_approved": approved,
        "unresolved": [{"page": 4, "type": "source_text_truncated", "text": TRUNCATED,
                        "resolution": "Câu mô phỏng bị ngắt; không suy đoán phần thiếu."}] if unresolved else [],
        "pages": [{"page": n} for n in range(1, 5)],
    }
    return {"sources": [source], "source_count": 1, "page_count": 4, "human_approved": approved}, source


def public_manifest() -> dict:
    return copy.deepcopy(load_manifest(PUBLIC_MANIFEST))
