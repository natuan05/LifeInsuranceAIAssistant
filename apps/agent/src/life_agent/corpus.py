"""Offline corpus preparation and indexing (plan Task 7; Agent_Design #metadata-context, #parent-child-chunking,
#cross-references, "Chuẩn bị dữ liệu ngoài ứng dụng").

Pipeline: manifest + reviewed Markdown -> PreparedVersion (NFC, page anchors, boilerplate removal, editorial notes kept
apart) -> structure-based parent/child chunks with a metadata prefix kept separate from the original content -> explicit
references resolved inside the same document/version -> one atomic write per document/version.

Chunk sizes, the prefix template and chunk_type labels are experiment parameters carried in a versioned CorpusConfig,
not approved defaults. Nothing here grants access: scope is always applied by retrieval from Core's answer.
The Public corpus is ``ai_checked/needs_human_review`` (G5 not passed); indexing it requires ``allow_unapproved`` and
every row records the approval status so a trial is never mistaken for an approved corpus.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
import uuid
from collections import Counter
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Protocol, Sequence

REPO_ROOT = Path(__file__).resolve().parents[4]
CHUNK_SCHEMA = "rag-chunk-v1"
_NAMESPACE = uuid.UUID("5d9a3f3e-6c1b-4f0e-9a51-7f1d2c3b4a60")

# Agent_Design #mvp-products (decided 28/10/2026): 7 products, 4 main + 3 riders, keyed by source folder.
PRODUCTS: dict[str, dict[str, str]] = {
    "XanhPhuQuy": {"code": "XanhPhuQuy", "name": "Xanh Phú Quý", "role": "MAIN"},
    "XanhTuongLai": {"code": "XanhTuongLai", "name": "Xanh Tương Lai", "role": "MAIN"},
    "XanhUocMo": {"code": "XanhUocMo", "name": "Xanh Ước Mơ", "role": "MAIN"},
    "HanhTrinhHanhPhuc_GiaTangBaoVe": {"code": "HanhTrinhHanhPhuc_GiaTangBaoVe",
                                       "name": "Hành Trình Hạnh Phúc – Gia Tăng Bảo Vệ", "role": "MAIN"},
    "DuPhongXanh": {"code": "DuPhongXanh", "name": "Dự Phòng Xanh", "role": "RIDER"},
    "HoVeXanh": {"code": "HoVeXanh", "name": "Hộ Vệ Xanh", "role": "RIDER"},
    "LaChanXanh": {"code": "LaChanXanh", "name": "Lá Chắn Xanh", "role": "RIDER"},
}
# Two options of one product (Agent_Design #mvp-products); retrieved separately, never merged.
OPTIONS: dict[str, str] = {
    "XanhUocMo/Full-TnC-UL049.pdf": "UL049 – Số Tiền Bảo Hiểm không tự động gia tăng",
    "XanhUocMo/Full-TnC-ULP50.pdf": "ULP50 – Số Tiền Bảo Hiểm tự động gia tăng",
}
DOCUMENT_TYPES = {"terms_and_conditions": "TERMS", "important_note": "NOTICE"}
EXPECTED_INVENTORY = {"sources": 13, "pages": 243, "products": 7, "main": 4, "rider": 3,
                      "terms_and_conditions": 8, "important_note": 5}


class CorpusError(ValueError):
    pass


@dataclass(frozen=True)
class CorpusConfig:
    """Versioned chunking parameters (experiment variant). No field has a default."""

    config_id: str
    dataset_version: str
    child_target_chars: int
    child_max_chars: int
    child_min_chars: int
    parent_max_chars: int
    boilerplate_min_pages: int
    boilerplate_page_ratio: float
    boilerplate_max_line_chars: int
    allow_unapproved: bool

    def __post_init__(self) -> None:
        for f in fields(self):
            if getattr(self, f.name) is None:
                raise CorpusError(f"{f.name} is required")
        if not 0 < self.child_min_chars < self.child_target_chars <= self.child_max_chars <= self.parent_max_chars:
            raise CorpusError("expected 0 < child_min < child_target <= child_max <= parent_max")
        if self.parent_max_chars > 8000:
            raise CorpusError("parent_max_chars must fit Evidence.content (8000)")

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any]) -> "CorpusConfig":
        names = {f.name for f in fields(cls)}
        missing = names - set(data)
        if missing:
            raise CorpusError("corpus config missing: " + ", ".join(sorted(missing)))
        return cls(**{k: data[k] for k in names})


@dataclass
class Block:
    kind: str  # heading | paragraph | table | html_table
    text: str
    pages: list[int]
    anchor: str | None
    level: int = 0
    notes: list[str] = field(default_factory=list)  # editorial notes attached to the preceding content


@dataclass
class PreparedVersion:
    document_id: str
    document_version: str
    title: str
    document_type: str
    access_scope: str
    product: dict[str, Any]
    source: dict[str, Any]
    approval: dict[str, Any]
    dataset_version: str
    corpus_config: CorpusConfig
    blocks: list[Block]
    source_issues: list[dict[str, Any]]
    boilerplate_removed: int
    page_count: int


@dataclass
class PreparedChunk:
    chunk_key: str
    evidence_key: str
    kind: str  # parent | child
    parent_key: str | None
    ordinal: int
    document_id: str
    document_version: str
    section_key: str
    heading_path: list[str]
    clause: str
    chunk_type: str
    pages: list[int]
    anchor: str | None
    content: str
    prefix: str
    refs: list[dict[str, Any]] = field(default_factory=list)
    issues: list[dict[str, Any]] = field(default_factory=list)
    editorial_notes: list[str] = field(default_factory=list)

    @property
    def embedding_text(self) -> str:
        """Prefix + original content. The prefix is context for search only, never quoted as evidence."""
        return f"{self.prefix}\n\n{self.content}"


@dataclass
class RefReport:
    chunks: list[PreparedChunk]
    counts: dict[str, int]
    items: list[dict[str, Any]]


@dataclass(frozen=True)
class IndexReceipt:
    document_id: str
    document_version: str
    fingerprint: str
    chunks_written: int
    parents: int
    children: int
    skipped: bool
    embedding_config_id: str


class IndexClient(Protocol):
    def write_version(self, version: PreparedVersion, chunks: Sequence[PreparedChunk]) -> IndexReceipt: ...


# ---------------------------------------------------------------------------------------------- catalog/inventory

def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def catalog_entry(source: Mapping[str, Any]) -> dict[str, str]:
    """Local stand-in for Core's catalog (Task 3): stable document id from the source path and a version label tied to
    the source checksum. It is not Core's currentVersion and grants nothing."""
    document_id = str(uuid.uuid5(_NAMESPACE, "manulife-public:" + source["source_relative_path"]))
    return {"document_id": document_id, "document_version": "sha256-" + source["source_sha256"][:12]}


def display_title(product: Mapping[str, Any], document_title: str) -> str:
    """Catalog title shown with evidence: product (and option) first, so passages from look-alike TnC documents of
    different products stay distinguishable. The original title is kept in source metadata."""
    name = product["name"] + (f" ({product['option']})" if product.get("option") else "")
    return f"{name} – {unicodedata.normalize('NFC', document_title)}"[:255]


def load_manifest(path: Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def inventory(manifest: Mapping[str, Any], *, repo_root: Path = REPO_ROOT) -> dict[str, Any]:
    """Step 2: 13 PDF / 243 pages / 7 products (4 main, 3 riders), 8 TnC / 5 ImportantNote, checksums as listed."""
    sources = manifest["sources"]
    kinds = Counter(s["document_kind"] for s in sources)
    folders = {s["source_relative_path"].split("/")[0] for s in sources}
    unknown = folders - set(PRODUCTS)
    if unknown:
        raise CorpusError("source folders outside the MVP product list: " + ", ".join(sorted(unknown)))
    roles = Counter(PRODUCTS[f]["role"] for f in folders)
    found = {"sources": len(sources), "pages": sum(s["source_page_count"] for s in sources), "products": len(folders),
             "main": roles["MAIN"], "rider": roles["RIDER"], "terms_and_conditions": kinds["terms_and_conditions"],
             "important_note": kinds["important_note"]}
    if found != EXPECTED_INVENTORY:
        raise CorpusError(f"inventory mismatch: {found}")
    if manifest["source_count"] != len(sources) or manifest["page_count"] != found["pages"]:
        raise CorpusError("manifest totals disagree with its sources")
    checksum_errors = []
    for s in sources:
        md = repo_root / s["output_markdown"]
        if not md.is_file() or _sha256_file(md) != s["output_sha256"]:
            checksum_errors.append(s["output_markdown"])
        if len(s["pages"]) != s["source_page_count"]:
            checksum_errors.append(s["source_relative_path"] + ":pages")
    if checksum_errors:
        raise CorpusError("checksum/page mismatch: " + ", ".join(checksum_errors))
    options = sorted(OPTIONS[s["source_relative_path"]] for s in sources if s["source_relative_path"] in OPTIONS)
    return {**found, "human_approved": bool(manifest.get("human_approved")),
            "statuses": dict(Counter(s["status"] for s in sources)), "xanh_uoc_mo_options": options}


# ---------------------------------------------------------------------------------------------- parsing

_ANCHOR = re.compile(r'^<a id="([^"]+)"></a>\s*$')
_PAGE_ANCHOR = re.compile(r"^pdf-page-(\d+)$")
_PAGE_HEADING = re.compile(r"^##\s+Trang PDF\s+\d+\s*$")
_HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
_EDITORIAL = re.compile(r"^>\s*(?:\*\*)?Ghi chú (?:hiệu đính|biên tập)", re.IGNORECASE)


def _split_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 4)
    if end < 0:
        raise CorpusError("unterminated frontmatter")
    meta = {}
    for line in text[4:end].splitlines():
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip().strip('"')
    return meta, text[end + 5:]


def _clean_heading(text: str) -> str:
    text = re.sub(r"\*\*|__", "", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_blocks(body: str) -> list[Block]:
    """Markdown body -> blocks with the PDF pages (or anchor) they come from. Headings 'Trang PDF N' are page markers."""
    blocks: list[Block] = []
    page: int | None = None
    anchor: str | None = None
    lines = body.split("\n")
    i = 0

    def location() -> tuple[list[int], str | None]:
        return ([page] if page is not None else []), anchor

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        match = _ANCHOR.match(stripped)
        if match:
            anchor = match.group(1)
            pm = _PAGE_ANCHOR.match(anchor)
            if pm:
                page = int(pm.group(1))
            i += 1
            continue
        if _PAGE_HEADING.match(stripped):
            i += 1
            continue
        pages, anc = location()
        if stripped.startswith("<table"):
            buf = []
            while i < len(lines):
                buf.append(lines[i])
                if "</table>" in lines[i]:
                    i += 1
                    break
                i += 1
            blocks.append(Block("html_table", "\n".join(buf).strip(), pages, anc))
            continue
        if stripped.startswith("|"):
            buf = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                buf.append(lines[i].rstrip())
                i += 1
            blocks.append(Block("table", "\n".join(buf), pages, anc))
            continue
        if stripped.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip())
                i += 1
            text = "\n".join(buf)
            if _EDITORIAL.match(text) and blocks:
                note = re.sub(r"^>\s?", "", text, flags=re.M)
                blocks[-1].notes.append(_clean_heading(note))
                continue
            blocks.append(Block("paragraph", text, pages, anc))
            continue
        heading = _HEADING.match(stripped)
        if heading:
            blocks.append(Block("heading", _clean_heading(heading.group(2)), pages, anc, level=len(heading.group(1))))
            i += 1
            continue
        buf = []
        while i < len(lines):
            s = lines[i].strip()
            if not s or _ANCHOR.match(s) or _HEADING.match(s) or s.startswith(("|", "<table", ">")):
                break
            buf.append(lines[i].rstrip())
            i += 1
        blocks.append(Block("paragraph", "\n".join(buf).strip(), pages, anc))
    return blocks


def remove_boilerplate(blocks: list[Block], config: CorpusConfig) -> tuple[list[Block], int]:
    """Repeated short header/footer lines: same normalised text standing alone on many pages. The reviewed Public
    Markdown already dropped footers; this guards new sources and is reported, never silent."""
    by_page: dict[int, set[str]] = {}
    for b in blocks:
        if b.kind == "paragraph" and b.pages and len(b.text) <= config.boilerplate_max_line_chars and "\n" not in b.text:
            by_page.setdefault(b.pages[0], set()).add(re.sub(r"\d+", "#", b.text.lower()))
    pages = len({b.pages[0] for b in blocks if b.pages})
    if pages < config.boilerplate_min_pages:
        return blocks, 0
    counts = Counter(t for texts in by_page.values() for t in texts)
    repeated = {t for t, n in counts.items() if n / pages >= config.boilerplate_page_ratio}
    kept = [b for b in blocks if not (b.kind == "paragraph" and "\n" not in b.text
                                      and re.sub(r"\d+", "#", b.text.lower()) in repeated)]
    return kept, len(blocks) - len(kept)


def prepare_document(source: Mapping[str, Any], manifest: Mapping[str, Any], config: CorpusConfig, *,
                     repo_root: Path = REPO_ROOT, catalog: Mapping[str, str] | None = None) -> PreparedVersion:
    """One reviewed Markdown -> PreparedVersion. Checksums must match the manifest; approval status is carried."""
    if source not in manifest["sources"]:
        raise CorpusError("source is not listed in the manifest")
    path = repo_root / source["output_markdown"]
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != source["output_sha256"]:
        raise CorpusError(f"Markdown checksum differs from manifest: {source['output_markdown']}")
    approved = bool(source.get("human_approved"))
    if not approved and not config.allow_unapproved:
        raise CorpusError("source is not human-approved (G5); trial use needs allow_unapproved")
    text = unicodedata.normalize("NFC", raw.decode("utf-8")).replace("\r\n", "\n")
    meta, body = _split_frontmatter(text)
    if meta.get("source_sha256") and meta["source_sha256"] != source["source_sha256"]:
        raise CorpusError("frontmatter source checksum differs from manifest")
    blocks, removed = remove_boilerplate(parse_blocks(body), config)
    folder = source["source_relative_path"].split("/")[0]
    if folder not in PRODUCTS:
        raise CorpusError("unknown product folder")
    product = {**PRODUCTS[folder], "option": OPTIONS.get(source["source_relative_path"])}
    ids = dict(catalog) if catalog else catalog_entry(source)
    issues = [{"code": "SOURCE_WARNING", "type": u.get("type", "source_issue"), "page": u.get("page"),
               "text": unicodedata.normalize("NFC", u.get("text", "")), "reason": u.get("resolution", "")[:300]}
              for u in source.get("unresolved", [])]
    doc_type = DOCUMENT_TYPES.get(source["document_kind"])
    if doc_type is None:
        raise CorpusError("unknown document kind")
    return PreparedVersion(
        document_id=ids["document_id"], document_version=ids["document_version"],
        title=display_title(product, source["document_title"]), document_type=doc_type, access_scope="PUBLIC",
        product=product,
        source={"relative_path": source["source_relative_path"], "sha256": source["source_sha256"],
                "document_title": unicodedata.normalize("NFC", source["document_title"]),
                "output_markdown": source["output_markdown"], "output_sha256": source["output_sha256"]},
        approval={"status": source["status"], "human_approved": approved},
        dataset_version=config.dataset_version, corpus_config=config, blocks=blocks, source_issues=issues,
        boilerplate_removed=removed, page_count=source["source_page_count"])


# ---------------------------------------------------------------------------------------------- chunking

_SECTION_KEY = re.compile(r"^(Điều|Phụ\s+lục|Chương|Mục)\s+([0-9]+(?:\.[0-9]+)*|[IVXLC]+)\b", re.IGNORECASE)
_SENTENCE_END = re.compile(r"(?<=[.;:!?])\s+(?=\S)")
_TYPE_RULES = (("EXCLUSION", ("loại trừ",)), ("WAITING_PERIOD", ("thời gian chờ",)),
               ("DEFINITION", ("giải thích từ ngữ", "định nghĩa")), ("DISEASE_DEF", ("bệnh lý nghiêm trọng", "danh sách bệnh")),
               ("CLAIM_PROCEDURE", ("hồ sơ giải quyết", "giải quyết quyền lợi", "thủ tục")), ("BENEFIT", ("quyền lợi",)))
_KIND_SLUG = {"điều": "dieu", "phụ lục": "phu-luc", "chương": "chuong", "mục": "muc"}


def section_key_of(heading: str) -> str | None:
    match = _SECTION_KEY.match(heading)
    if not match:
        return None
    kind = re.sub(r"\s+", " ", match.group(1).lower())
    return f"{_KIND_SLUG[kind]}-{match.group(2).lower()}"


def _slug(text: str) -> str:
    plain = unicodedata.normalize("NFKD", text.replace("đ", "d").replace("Đ", "D"))
    plain = "".join(c for c in plain if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", plain).strip("-")[:40] or "muc"


def _chunk_type(heading_path: Sequence[str], has_table: bool) -> str:
    text = " ".join(heading_path).lower()
    for label, words in _TYPE_RULES:
        if any(w in text for w in words):
            return label
    return "TABLE" if has_table else "GENERAL"


def _split_long(block: Block, limit: int) -> list[Block]:
    """Split one oversized block without cutting a sentence; tables repeat their header row(s)."""
    if len(block.text) <= limit:
        return [block]
    if block.kind == "table":
        rows = block.text.split("\n")
        header = rows[:2] if len(rows) > 1 and re.match(r"^\|\s*:?-{2,}", rows[1]) else rows[:1]
        body, parts, current = rows[len(header):], [], []
        for row in body:
            if current and len("\n".join(header + current + [row])) > limit:
                parts.append(current)
                current = []
            current.append(row)
        if current:
            parts.append(current)
        return [Block("table", "\n".join(header + p), block.pages, block.anchor) for p in parts]
    if block.kind == "html_table":
        return [block]  # merged cells: never split; parent cap handles size
    pieces, current = [], ""
    for sentence in _SENTENCE_END.split(block.text):
        candidate = f"{current} {sentence}".strip() if current else sentence
        if current and len(candidate) > limit:
            pieces.append(current)
            current = sentence
        else:
            current = candidate
    if current:
        pieces.append(current)
    return [Block(block.kind, p, block.pages, block.anchor) for p in pieces]


@dataclass
class _Section:
    key: str
    heading: str
    chapter: str | None
    blocks: list[Block]


def _sections(version: PreparedVersion) -> list[_Section]:
    sections: list[_Section] = []
    chapter: str | None = None
    original = version.source.get("document_title", version.title)
    current = _Section("s000-" + _slug(original), original, None, [])
    used: Counter[str] = Counter()
    for block in version.blocks:
        if block.kind == "heading" and block.level == 1:
            continue  # document title
        if block.kind == "heading" and block.level <= 3:
            numbered = section_key_of(block.text)
            if numbered is None and current.key.startswith(("dieu-", "phu-luc-")):
                # an unnumbered heading inside a numbered Điều/Phụ lục (e.g. "Bảng: ...") stays in that section
                current.blocks.append(Block("heading", block.text, block.pages, block.anchor, level=4, notes=block.notes))
                continue
            if current.blocks:
                sections.append(current)
            key = section_key_of(block.text) or f"s{len(sections) + 1:03d}-{_slug(block.text)}"
            if key.startswith("chuong-"):
                chapter = block.text
            used[key] += 1
            if used[key] > 1:
                key = f"{key}~{used[key]}"  # duplicate heading key in one document: references to it are ambiguous
            current = _Section(key, block.text, None if key.startswith("chuong-") else chapter, [block])
            continue
        current.blocks.append(block)
    if current.blocks:
        sections.append(current)
    # a section holding only its heading (e.g. "Chương II.") adds no passage; its title stays in heading_path
    return [s for s in sections if any(b.kind != "heading" for b in s.blocks)]


def build_chunks(version: PreparedVersion) -> list[PreparedChunk]:
    """Structure-based parent/child chunks. Children never cross a section (Chương/Điều/Phụ lục) or a sub-heading;
    parents are whole sections, split only past parent_max_chars at child boundaries."""
    cfg = version.corpus_config
    chunks: list[PreparedChunk] = []
    ordinal = 0
    doc_prefix = f"{version.document_id}:{version.document_version}:{cfg.dataset_version}"
    product = version.product["name"] + (f" ({version.product['option']})" if version.product["option"] else "")
    for section in _sections(version):
        groups: list[dict[str, Any]] = []
        sub_path: list[str] = []
        current: dict[str, Any] | None = None

        def flush() -> None:
            nonlocal current
            if current and current["blocks"]:
                groups.append(current)
            current = None

        for block in section.blocks:
            if block.kind == "heading" and block.level > 3:
                flush()
                sub_path = [block.text]
            for piece in _split_long(block, cfg.child_max_chars):
                if current is None:
                    current = {"blocks": [], "sub": list(sub_path)}
                size = sum(len(b.text) + 2 for b in current["blocks"])
                only_headings = all(b.kind == "heading" for b in current["blocks"])
                if current["blocks"] and not only_headings and size + len(piece.text) > cfg.child_target_chars:
                    flush()
                    current = {"blocks": [], "sub": list(sub_path)}
                current["blocks"].append(piece)
        flush()
        # merge a tiny trailing group into the previous one of the same section when it still fits
        merged: list[dict[str, Any]] = []
        for g in groups:
            g_len = sum(len(b.text) + 2 for b in g["blocks"])
            if merged and g_len < cfg.child_min_chars and g["sub"] == merged[-1]["sub"] and \
                    sum(len(b.text) + 2 for b in merged[-1]["blocks"]) + g_len <= cfg.child_max_chars:
                merged[-1]["blocks"].extend(g["blocks"])
            else:
                merged.append(g)
        # parents: consecutive children of the section up to parent_max_chars
        parents: list[list[dict[str, Any]]] = []
        for g in merged:
            g_len = sum(len(b.text) + 2 for b in g["blocks"])
            if parents and sum(len(b.text) + 2 for x in parents[-1] for b in x["blocks"]) + g_len <= cfg.parent_max_chars:
                parents[-1].append(g)
            else:
                parents.append([g])
        clause = section.heading if len(section.heading) <= 100 else section.heading[:99] + "…"
        base_path = [p for p in (section.chapter, section.heading) if p]
        for p_index, parent_groups in enumerate(parents):
            all_blocks = [b for g in parent_groups for b in g["blocks"]]
            parent_key = f"{doc_prefix}:{section.key}:p{p_index}"
            path = base_path
            parent = _make_chunk(version, parent_key, "parent", None, ordinal, section.key, path, clause, all_blocks, product)
            chunks.append(parent)
            ordinal += 1
            for c_index, g in enumerate(parent_groups):
                child_key = f"{parent_key}:c{c_index}"
                chunks.append(_make_chunk(version, child_key, "child", parent_key, ordinal, section.key,
                                          path + g["sub"], clause, g["blocks"], product))
                ordinal += 1
    _attach_source_issues(version, chunks)
    return chunks


def _make_chunk(version: PreparedVersion, key: str, kind: str, parent_key: str | None, ordinal: int, section_key: str,
                heading_path: list[str], clause: str, blocks: list[Block], product: str) -> PreparedChunk:
    pages = sorted({p for b in blocks for p in b.pages})
    anchor = f"pdf-page-{pages[0]}" if pages else next((b.anchor for b in blocks if b.anchor), None)
    content = "\n\n".join(b.text for b in blocks)
    prefix = " | ".join([f"Sản phẩm: {product}", f"Tài liệu: {version.source['document_title']}",
                         "Mục: " + " > ".join(heading_path)])
    chunk = PreparedChunk(
        chunk_key=key, evidence_key="c" + hashlib.sha256(key.encode()).hexdigest()[:20], kind=kind,
        parent_key=parent_key, ordinal=ordinal, document_id=version.document_id,
        document_version=version.document_version, section_key=section_key, heading_path=list(heading_path),
        clause=clause, chunk_type=_chunk_type(heading_path, any(b.kind != "paragraph" and b.kind != "heading" for b in blocks)),
        pages=pages, anchor=anchor, content=content, prefix=prefix,
        editorial_notes=[n for b in blocks for n in b.notes])
    if kind == "child":
        chunk.refs = extract_refs(content, section_key)
    return chunk


def _attach_source_issues(version: PreparedVersion, chunks: list[PreparedChunk]) -> None:
    """Manifest source warnings (e.g. UL049 p29 truncated sentence) go into issue metadata of the chunks that carry
    the affected text. The visible text is kept as is; nothing is filled in from another option."""
    for issue in version.source_issues:
        needle = issue["text"][:60]
        hits = [c for c in chunks if (issue["page"] in c.pages if issue["page"] else True) and needle and needle in c.content]
        if not hits:
            raise CorpusError(f"source issue text not found on page {issue['page']}")
        for c in hits:
            c.issues.append(dict(issue))


# ---------------------------------------------------------------------------------------------- references

# Chương is a container heading, not condition text: references to it are not followed.
_REF = re.compile(r"\b(Điều|Phụ\s+lục)\s+([0-9]+(?:\.[0-9]+)*|[IVX]+)\b(?:\s*(?:\(|,)?\s*([a-zđ])\))?", re.IGNORECASE)
_EXTERNAL = re.compile(r"^\W{0,3}(?:(?:khoản|điểm)\s+\S+\s+)?(?:của|theo|tại|trong)?\s*(?:các\s+)?"
                       r"(Luật|Bộ\s+luật|Nghị\s+định|Thông\s+tư|Quy\s+Tắc|Điều\s+Khoản\s+Chung|Sản\s+Phẩm\s+Chính|Hợp\s+Đồng\s+gốc)",
                       re.IGNORECASE)
_VAGUE = re.compile(r"\b(nêu trên|nói trên|như trên|kể trên|dưới đây)\b", re.IGNORECASE)


def extract_refs(content: str, own_section: str) -> list[dict[str, Any]]:
    refs, seen = [], set()
    for m in _REF.finditer(content):
        kind = re.sub(r"\s+", " ", m.group(1).lower())
        number = m.group(2).lower()
        raw = re.sub(r"\s+", " ", m.group(0)).strip()
        after = content[m.end(): m.end() + 60]
        candidates = [f"{_KIND_SLUG[kind]}-{number}"]
        if "." in number:
            parts = number.split(".")
            candidates += [f"{_KIND_SLUG[kind]}-{'.'.join(parts[:i])}" for i in range(len(parts) - 1, 0, -1)]
        if own_section in candidates:
            continue  # reference to the section that contains it
        line_start = content.rfind("\n", 0, m.start()) + 1
        line_end = content.find("\n", m.end())
        line = content[line_start: line_end if line_end >= 0 else len(content)]
        if m.start() == line_start and re.search(r"\s\d+\s*$", line):
            continue  # table-of-contents entry ("Điều 3. Thời Gian Chờ 4"), not a reference
        external = bool(_EXTERNAL.match(after))
        key = (raw.lower(), external)
        if key in seen:
            continue
        seen.add(key)
        refs.append({"raw": raw, "kind": "explicit", "candidates": candidates, "external": external,
                     "status": "PENDING", "target_section_key": None, "reason": None})
    for m in _VAGUE.finditer(content):
        raw = m.group(0)
        if ("vague", raw.lower()) in seen:
            continue
        seen.add(("vague", raw.lower()))
        refs.append({"raw": raw, "kind": "vague", "candidates": [], "external": False, "status": "PENDING",
                     "target_section_key": None, "reason": None})
    return refs


def resolve_refs(chunks: Sequence[PreparedChunk]) -> RefReport:
    """Resolve explicit references inside the same document/version only. Targets are section keys (stable across
    re-chunking), not chunk ids. Cross-document, ambiguous and vague references stay UNRESOLVED for review."""
    # Distinct sections per document/version; a base key seen more than once (suffixed "~n") is ambiguous.
    keys: dict[tuple[str, str], set[str]] = {}
    for c in chunks:
        if c.kind == "parent":
            keys.setdefault((c.document_id, c.document_version), set()).add(c.section_key)
    distinct = {doc: Counter(k.split("~")[0] for k in ks) for doc, ks in keys.items()}
    out, items, counts = [], [], Counter()
    for c in chunks:
        c = PreparedChunk(**{**asdict(c), "refs": [dict(r) for r in c.refs]})
        sections = distinct.get((c.document_id, c.document_version), Counter())
        kinds_present = {k.rsplit("-", 1)[0] for k in sections}
        for ref in c.refs:
            if ref["kind"] == "vague":
                ref.update(status="UNRESOLVED", reason="AMBIGUOUS_PHRASE")
            elif ref["external"]:
                ref.update(status="UNRESOLVED", reason="CROSS_DOCUMENT")
            else:
                target = next((k for k in ref["candidates"] if k in sections), None)
                if target and sections[target] > 1:
                    ref.update(status="UNRESOLVED", reason="AMBIGUOUS_TARGET")
                elif target:
                    ref.update(status="RESOLVED", target_section_key=target, reason=None,
                               target_document_id=c.document_id, target_document_version=c.document_version)
                elif ref["candidates"][0].rsplit("-", 1)[0] not in kinds_present:
                    ref.update(status="UNRESOLVED", reason="NO_LOCAL_TARGET_KIND")
                else:
                    ref.update(status="TARGET_MISSING", reason="TARGET_MISSING")
            counts[ref["status"] if ref["status"] != "UNRESOLVED" else f"UNRESOLVED:{ref['reason']}"] += 1
            if ref["status"] != "RESOLVED":
                items.append({"chunk_key": c.chunk_key, "document_id": c.document_id, "section_key": c.section_key,
                              "raw": ref["raw"], "status": ref["status"], "reason": ref["reason"]})
        out.append(c)
    return RefReport(chunks=out, counts=dict(counts), items=items)


# ---------------------------------------------------------------------------------------------- indexing

def fingerprint(version: PreparedVersion, embedding_config_id: str) -> str:
    material = {"document_id": version.document_id, "document_version": version.document_version,
                "output_sha256": version.source["output_sha256"], "dataset_version": version.dataset_version,
                "corpus_config": asdict(version.corpus_config), "embedding": embedding_config_id, "schema": CHUNK_SCHEMA}
    return hashlib.sha256(json.dumps(material, sort_keys=True).encode()).hexdigest()


def chunk_metadata(version: PreparedVersion, chunk: PreparedChunk, *, fp: str, embedding: Mapping[str, Any]) -> dict[str, Any]:
    """Mapping into RagKnowledgeChunk.metadata (schema rag-chunk-v1, proposed for review)."""
    return {"schema": CHUNK_SCHEMA, "kind": chunk.kind, "chunk_key": chunk.chunk_key, "evidence_key": chunk.evidence_key,
            "parent_key": chunk.parent_key, "section_key": chunk.section_key, "heading_path": chunk.heading_path,
            "clause": chunk.clause, "title": version.title, "doc_type": version.document_type,
            "chunk_type": chunk.chunk_type, "pages": chunk.pages, "page_end": chunk.pages[-1] if chunk.pages else None,
            "anchor": chunk.anchor, "prefix": chunk.prefix, "refs": chunk.refs, "issues": chunk.issues,
            "editorial_notes": chunk.editorial_notes, "product": version.product, "approval": version.approval,
            "dataset_version": version.dataset_version, "corpus_config_id": version.corpus_config.config_id,
            "fingerprint": fp, "embedding": dict(embedding),
            "source": {"sha256": version.source["sha256"], "output_sha256": version.source["output_sha256"]}}


def index_version(version: PreparedVersion, index_client: IndexClient) -> IndexReceipt:
    """Build, resolve and write one document/version through the offline index client (atomic, deduplicated)."""
    report = resolve_refs(build_chunks(version))
    return index_client.write_version(version, report.chunks)


def vector_literal(values: Sequence[float]) -> str:
    return "[" + ",".join(repr(float(v)) for v in values) + "]"


class PgIndexWriter:
    """Offline index client for rag.rag_knowledge_chunks using the separate indexer role (never the runtime role).

    One transaction per document/version: advisory lock, dedup by fingerprint (document, version, Markdown checksum,
    dataset, corpus config, embedding config), DELETE + INSERT. Embeddings are computed before the transaction, so a
    provider failure leaves the previous version intact and no partial version is ever visible.
    The table's unique (document_id, document_version, chunk_index) holds one vector space per document/version; side
    by side comparison of two embedding models needs re-indexing or a reviewed schema change (open item).
    """

    def __init__(self, dsn: str, embedder: Any, embedding_config: Any, *, connect: Callable[..., Any] | None = None):
        self._dsn = dsn
        self._embedder = embedder
        self._config = embedding_config
        self._connect = connect

    def _connection(self):
        if self._connect:
            return self._connect()
        import psycopg

        return psycopg.connect(self._dsn, connect_timeout=10)

    def write_version(self, version: PreparedVersion, chunks: Sequence[PreparedChunk]) -> IndexReceipt:
        fp = fingerprint(version, self._config.config_id)
        parents = sum(1 for c in chunks if c.kind == "parent")
        receipt = IndexReceipt(version.document_id, version.document_version, fp, len(chunks), parents,
                               len(chunks) - parents, False, self._config.config_id)
        lock = f"rag-index:{version.document_id}:{version.document_version}"
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT metadata->>'fingerprint', count(*) FROM rag.rag_knowledge_chunks "
                            "WHERE document_id = %s AND document_version = %s GROUP BY 1",
                            (version.document_id, version.document_version))
                existing = cur.fetchall()
            conn.rollback()
            if existing == [(fp, len(chunks))]:
                return IndexReceipt(**{**asdict(receipt), "chunks_written": 0, "skipped": True})
            vectors = self._embedder.embed_documents([c.embedding_text for c in chunks], self._config)
            identity = self._config.identity()
            if len(vectors) != len(chunks) or any({k: v[k] for k in identity} != identity for v in vectors):
                raise CorpusError("embedding identity/dimension mismatch; nothing written")
            rows = []
            for chunk, vector in zip(chunks, vectors):
                meta = chunk_metadata(version, chunk, fp=fp, embedding=identity)
                rows.append((str(uuid.uuid5(_NAMESPACE, f"{chunk.chunk_key}:{fp}")), version.document_id,
                             version.document_version, chunk.ordinal, chunk.content, vector_literal(vector["values"]),
                             version.access_scope, chunk.pages[0] if chunk.pages else None,
                             json.dumps(meta, ensure_ascii=False)))
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (lock,))
                    cur.execute("SELECT metadata->>'fingerprint', count(*) FROM rag.rag_knowledge_chunks "
                                "WHERE document_id = %s AND document_version = %s GROUP BY 1",
                                (version.document_id, version.document_version))
                    if cur.fetchall() == [(fp, len(chunks))]:  # another writer finished the same version meanwhile
                        return IndexReceipt(**{**asdict(receipt), "chunks_written": 0, "skipped": True})
                    cur.execute("DELETE FROM rag.rag_knowledge_chunks WHERE document_id = %s AND document_version = %s",
                                (version.document_id, version.document_version))
                    cur.executemany(
                        "INSERT INTO rag.rag_knowledge_chunks (id, document_id, document_version, chunk_index, content, "
                        "embedding, access_scope, product_id, policy_id, owner_customer_id, page_number, metadata) "
                        "VALUES (%s, %s, %s, %s, %s, %s::vector, %s, NULL, NULL, NULL, %s, %s::jsonb)", rows)
        return receipt


def prepare_corpus(manifest: Mapping[str, Any], config: CorpusConfig, *, repo_root: Path = REPO_ROOT
                   ) -> list[tuple[PreparedVersion, RefReport]]:
    out = []
    for source in manifest["sources"]:
        version = prepare_document(source, manifest, config, repo_root=repo_root)
        out.append((version, resolve_refs(build_chunks(version))))
    return out


def corpus_summary(prepared: Iterable[tuple[PreparedVersion, RefReport]]) -> dict[str, Any]:
    docs, totals, refs = [], Counter(), Counter()
    for version, report in prepared:
        children = [c for c in report.chunks if c.kind == "child"]
        parents = [c for c in report.chunks if c.kind == "parent"]
        totals["children"] += len(children)
        totals["parents"] += len(parents)
        refs.update(report.counts)
        docs.append({"document": version.source["relative_path"], "document_id": version.document_id,
                     "document_version": version.document_version, "approval": version.approval["status"],
                     "children": len(children), "parents": len(parents),
                     "avg_child_chars": round(sum(len(c.content) for c in children) / max(len(children), 1)),
                     "max_child_chars": max((len(c.content) for c in children), default=0),
                     "max_parent_chars": max((len(c.content) for c in parents), default=0),
                     "source_warnings": sum(len(c.issues) for c in children),
                     "boilerplate_removed": version.boilerplate_removed})
    return {"documents": docs, "totals": dict(totals), "refs": dict(refs)}


def _main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Prepare (and optionally index) the Public corpus offline.")
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--trial", required=True, type=Path, help="approved trial configuration JSON")
    parser.add_argument("--out", type=Path, help="write chunk JSONL here (must be inside an ignored local area)")
    parser.add_argument("--index", action="store_true", help="embed and write to rag (needs indexer credential)")
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--embed-retries", type=int, default=4, help="retries per batch on provider outage (offline)")
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    trial = json.loads(args.trial.read_text(encoding="utf-8"))
    config = CorpusConfig.from_mapping(trial["corpus"])
    manifest = load_manifest(args.manifest)
    inv = inventory(manifest)
    prepared = prepare_corpus(manifest, config)
    summary = corpus_summary(prepared)
    print(json.dumps({"inventory": inv, "summary": summary["totals"], "refs": summary["refs"]}, ensure_ascii=False))
    if args.out:
        out = args.out.resolve()
        if not str(out).startswith(str((REPO_ROOT / ".local").resolve())):
            raise CorpusError("--out must be inside the repository's ignored .local/ directory")
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("w", encoding="utf-8") as fh:
            for version, report in prepared:
                for c in report.chunks:
                    fh.write(json.dumps(asdict(c), ensure_ascii=False) + "\n")
    if args.index:
        from .config import load_env, require
        from .model import EmbeddingConfig, GeminiEmbedding
        env = load_env(args.env_file)
        emb_cfg = EmbeddingConfig.from_mapping(trial["embedding"])
        embedder = GeminiEmbedding(env, document_retries=args.embed_retries)
        writer = PgIndexWriter(require(env, "LIFE_AGENT_RAG_INDEXER_DSN"), embedder, emb_cfg)
        for version, _ in prepared:
            receipt = index_version(version, writer)
            print(json.dumps({"document": version.source["relative_path"], "chunks_written": receipt.chunks_written,
                              "skipped": receipt.skipped, "embedding": receipt.embedding_config_id}, ensure_ascii=False))
        print(json.dumps({"embedding_requests": embedder.calls, "retries": embedder.retries,
                          "input_chars": embedder.input_chars}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(_main())
