import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from urllib.parse import quote_plus

import requests
from pypdf import PdfReader

WORKSPACE = Path(r"D:\6-工作相关\0-YMBot\newhome")
PDF_DIRS = {
    "vla": Path(r"D:\0-Paper\paper_vla"),
    "wam": Path(r"D:\0-Paper\paper_wam"),
}
TARGETS = {
    "vla": WORKSPACE / "tutorial-posts" / "model-vla.json",
    "wam": WORKSPACE / "tutorial-posts" / "model-wam.json",
}

ARXIV_RE = re.compile(r"arXiv\s*:?\s*(\d{4}\.\d{4,5})(v\d+)?", re.IGNORECASE)
DOI_RE = re.compile(r"(10\.\d{4,9}/[-._;()/:A-Z0-9]+)", re.IGNORECASE)


def norm_space(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def extract_text_snippet(pdf_path: Path) -> str:
    try:
        reader = PdfReader(str(pdf_path))
        chunks = []
        for i, page in enumerate(reader.pages[:2]):
            try:
                chunks.append(page.extract_text() or "")
            except Exception:
                continue
        return "\n".join(chunks)
    except Exception:
        return ""


@dataclass
class PaperMeta:
    title: str
    date_label: str
    url: str
    source: str


def query_arxiv(arxiv_id: str) -> Optional[PaperMeta]:
    try:
        resp = requests.get(
            "http://export.arxiv.org/api/query",
            params={"id_list": arxiv_id},
            timeout=20,
        )
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
        ns = {"a": "http://www.w3.org/2005/Atom"}
        entry = root.find("a:entry", ns)
        if entry is None:
            return None
        title = norm_space(entry.findtext("a:title", default="", namespaces=ns))
        published = norm_space(entry.findtext("a:published", default="", namespaces=ns))
        m = re.match(r"^(\d{4})-(\d{2})", published)
        date_label = f"{m.group(1)}-{m.group(2)}" if m else ""
        url = f"https://arxiv.org/abs/{arxiv_id}"
        if not title:
            title = arxiv_id
        return PaperMeta(title=title, date_label=date_label, url=url, source="arxiv")
    except Exception:
        return None


def query_crossref(doi: str) -> Optional[PaperMeta]:
    try:
        doi_clean = doi.strip().rstrip(".,;)")
        resp = requests.get(f"https://api.crossref.org/works/{quote_plus(doi_clean)}", timeout=20)
        resp.raise_for_status()
        msg = resp.json().get("message", {})
        titles = msg.get("title") or []
        title = norm_space(titles[0] if titles else "")
        if not title:
            return None

        date_label = ""
        for key in ("published-print", "published-online", "issued"):
            obj = msg.get(key) or {}
            parts = (obj.get("date-parts") or [])
            if parts and parts[0]:
                y = parts[0][0] if len(parts[0]) > 0 else None
                m = parts[0][1] if len(parts[0]) > 1 else 1
                if isinstance(y, int):
                    date_label = f"{y:04d}-{int(m):02d}"
                    break

        url = norm_space(msg.get("URL") or f"https://doi.org/{doi_clean}")
        return PaperMeta(title=title, date_label=date_label, url=url, source="crossref")
    except Exception:
        return None


def fallback_title_from_pdf(pdf_path: Path, snippet: str) -> str:
    # Use stable filename stem for fallback to avoid noisy OCR/text extraction artifacts.
    return pdf_path.stem


def process_pdf(pdf_path: Path) -> dict:
    snippet = extract_text_snippet(pdf_path)

    arxiv_match = ARXIV_RE.search(snippet)
    if arxiv_match:
        arxiv_id = arxiv_match.group(1)
        meta = query_arxiv(arxiv_id)
        if meta:
            return {
                "dateLabel": meta.date_label,
                "modelLabel": meta.title,
                "modelUrl": meta.url,
            }

    doi_match = DOI_RE.search(snippet.upper())
    if doi_match:
        doi = doi_match.group(1)
        meta = query_crossref(doi)
        if meta:
            return {
                "dateLabel": meta.date_label,
                "modelLabel": meta.title,
                "modelUrl": meta.url,
            }

    title = fallback_title_from_pdf(pdf_path, snippet)
    return {
        "dateLabel": "",
        "modelLabel": title,
        "modelUrl": f"https://scholar.google.com/scholar?q={quote_plus(title)}",
    }


def sort_key(item: dict):
    raw = norm_space(item.get("dateLabel", ""))
    m = re.match(r"^(\d{4})(?:-(\d{2}))?", raw)
    if not m:
        return (9999, 99, item.get("modelLabel", ""))
    y = int(m.group(1))
    mm = int(m.group(2)) if m.group(2) else 1
    return (y, mm, item.get("modelLabel", ""))


def rebuild(kind: str):
    pdf_dir = PDF_DIRS[kind]
    target = TARGETS[kind]

    entries = []
    for pdf in sorted(pdf_dir.glob("*.pdf"), key=lambda p: p.name.lower()):
        entries.append(process_pdf(pdf))

    entries.sort(key=sort_key)

    obj = json.loads(target.read_text(encoding="utf-8"))
    obj["roadmap"] = entries
    target.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    rebuild("vla")
    rebuild("wam")
    print("Rebuilt model-vla.json and model-wam.json from PDF intrinsic IDs (arXiv/DOI priority).")
