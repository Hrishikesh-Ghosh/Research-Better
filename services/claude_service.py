import os
import re
import json
from groq import Groq

client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))

# ─────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────

SUMMARY_PROMPT = """You are an expert academic research assistant. Analyze the following research paper text and produce a structured summary with exactly these six sections. Be thorough but concise. Use bullet points where appropriate.

Format your response EXACTLY like this (use these exact headings):

**OVERVIEW**
[2-4 sentence high-level description of what this paper is about]

**OBJECTIVE**
[The specific goals and aims of the research. Use bullet points if multiple objectives.]

**DATASET DESCRIPTION**
[Describe the dataset(s) used — source, size, features, splits. If no dataset, describe the study subjects or materials.]

**METHODOLOGY**
[The methods, algorithms, models, or approaches used. Use bullet points for clarity.]

**RESULTS & FINDINGS**
[Key quantitative and qualitative results. Include metrics, accuracy, performance numbers if present.]

**CONCLUSION**
[Main takeaways, limitations, and future work suggested by the authors.]

Research paper text:
---
{text}
---

Respond with only the six sections above. Do not add any preamble or closing remarks."""


def summarize_paper(text: str) -> dict:
    truncated = text[:15000]
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=2000,
        timeout=60,
        messages=[{"role": "user", "content": SUMMARY_PROMPT.format(text=truncated)}]
    )
    raw = response.choices[0].message.content
    return {"sections": _parse_sections(raw), "raw": raw}


def _parse_sections(raw: str) -> list:
    section_titles = ["OVERVIEW", "OBJECTIVE", "DATASET DESCRIPTION",
                      "METHODOLOGY", "RESULTS & FINDINGS", "CONCLUSION"]
    sections, lines = [], raw.split("\n")
    current_title, current_lines = None, []
    for line in lines:
        clean = line.strip().replace("**", "").strip()
        if clean in section_titles:
            if current_title:
                sections.append({"title": current_title,
                                  "content": "\n".join(current_lines).strip()})
            current_title, current_lines = clean, []
        elif current_title:
            current_lines.append(line)
    if current_title:
        sections.append({"title": current_title,
                          "content": "\n".join(current_lines).strip()})
    return sections


# ─────────────────────────────────────────────────────────────
# COMPARE
# ─────────────────────────────────────────────────────────────

COMPARE_PROMPT = """You are an expert academic research assistant. You are given {n} research papers. Extract and compare them across these exact features, then recommend the best one.

Respond in this EXACT JSON format and nothing else:

{{
  "papers": [
    {{
      "title": "short title of paper",
      "year": "publication year or N/A",
      "method": "main method or algorithm used",
      "dataset": "dataset(s) used",
      "accuracy": "accuracy metric if available, else N/A",
      "precision": "precision metric if available, else N/A",
      "training_time": "training time if mentioned, else N/A",
      "contribution": "main contribution in 5-8 words"
    }}
  ],
  "recommended_index": 0,
  "recommendation_reason": "One sentence explaining why this paper is best."
}}

recommended_index is the 0-based index of the best paper in the papers array.

{papers_block}

Return ONLY valid JSON. No markdown, no explanation, no code fences."""


def compare_papers(texts: list, titles: list) -> dict:
    papers_block = ""
    for i, (title, text) in enumerate(zip(titles, texts)):
        per_paper_limit = 12000 // len(texts)
        truncated = ''.join(c for c in text[:per_paper_limit] if c.isprintable())
        papers_block += f"\n\n--- PAPER {i + 1}: {title} ---\n{truncated}"

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=1500,
        timeout=60,
        messages=[{"role": "user",
                   "content": COMPARE_PROMPT.format(n=len(texts), papers_block=papers_block)}]
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"error": "Failed to parse comparison response.", "raw": raw}


# ─────────────────────────────────────────────────────────────
# CITATIONS  (pure Python — no LLM, style always correct)
# ─────────────────────────────────────────────────────────────

def _extract_references_section(text: str) -> list:
    """Pull individual reference strings out of the PDF text."""
    match = re.search(
        r'\n\s*(?:REFERENCES|BIBLIOGRAPHY|WORKS CITED|REFERENCE LIST)\s*\n',
        text, re.IGNORECASE
    )
    ref_text = text[match.end():] if match else text[-6000:]

    refs, current = [], []
    for line in ref_text.strip().split('\n'):
        s = line.strip()
        if not s:
            if current:
                refs.append(' '.join(current).strip())
                current = []
        elif re.match(r'^[\[\(]?\d+[\]\)\.]\s+', s):
            if current:
                refs.append(' '.join(current).strip())
                current = []
            current.append(s)
        else:
            current.append(s)
    if current:
        refs.append(' '.join(current).strip())

    return [r for r in refs if len(r) > 30]


def _parse_ref(raw: str) -> dict:
    """Parse a raw reference into fields. Handles IEEE, APA, MLA."""
    text = re.sub(r'^[\[\(]?\d+[\]\)\.]\s*', '', raw).strip()

    f = dict(authors='', title='', journal='',
             volume='', issue='', pages='', year='', doi='')

    # DOI / URL
    m = re.search(r'(https?://\S+|10\.\d{4,}/\S+)', text, re.I)
    if m:
        f['doi'] = m.group(1).rstrip('.,)')
        text = text[:m.start()].strip()

    # Year — grab ALL 4-digit years, use the last one (most likely pub year)
    years = re.findall(r'\b(19|20)\d{2}\b', text)
    if years:
        f['year'] = years[-1]

    # Pages
    m = re.search(r'pp?\.\s*([\d]+\s*[-–]\s*[\d]+|[\d]+)', text, re.I)
    if m:
        f['pages'] = m.group(1).replace('–', '-').replace(' ', '')

    # Volume / Issue
    m = re.search(r'\bvol\.?\s*(\w+)', text, re.I)
    if m:
        f['volume'] = m.group(1)
    m = re.search(r'\bno\.?\s*(\w+)', text, re.I)
    if m:
        f['issue'] = m.group(1)

    # Title — everything between "double quotes" or "smart quotes"
    m = re.search(r'["\u201c\u2018\u0022](.+?)["\u201d\u2019\u0022,]', text)
    if m:
        f['title'] = m.group(1).strip().rstrip(',')
        before_title = text[:m.start()].strip().rstrip(',').strip()
        after_title  = text[m.end():].strip().lstrip(',').strip()

        # Authors = everything before the opening quote
        f['authors'] = before_title.rstrip('.,').strip()

        # Journal = first token cluster after closing quote,
        # stopping at vol / no / pp / year / Art. / doi
        jm = re.match(
            r'^[,\s]*([A-Za-z][^,]+?)(?:\s*,\s*(?:vol|no\.|pp\.|art\.|in\s+proc|\d{4})|\.|$)',
            after_title, re.I
        )
        if jm:
            f['journal'] = jm.group(1).strip().rstrip('.,')
        else:
            # fallback: take everything up to first comma
            parts = after_title.split(',', 1)
            f['journal'] = parts[0].strip().rstrip('.,')

    else:
        # No quoted title — APA style: Author(s). (Year). Title. Journal...
        # Split on '. ' to get sentences
        sentences = re.split(r'\.\s+', text)
        if len(sentences) >= 3:
            f['authors']  = sentences[0].strip().rstrip('.,')
            # Remove (year) from authors if APA
            f['authors']  = re.sub(r'\s*\(\d{4}\)\.?\s*', '', f['authors']).strip()
            f['title']    = sentences[1].strip()
            f['journal']  = sentences[2].split(',')[0].strip().rstrip('.,')
        elif len(sentences) == 2:
            f['authors']  = sentences[0].strip().rstrip('.,')
            f['title']    = sentences[1].strip()
        else:
            f['authors']  = text[:50]

    return f


def _ieee_authors_to_apa(authors: str) -> str:
    """
    'S. Ameer, M. A. Shah, A. Khan, and M. N. Asghar'
    → 'Ameer, S., Shah, M. A., Khan, A., & Asghar, M. N.'
    """
    if not authors:
        return authors

    # Split carefully — only split on ', ' not on '. '
    # Replace ', and ' and ' and ' with a safe delimiter first
    cleaned = re.sub(r',?\s+and\s+', '|', authors)
    parts = [p.strip() for p in re.split(r',\s*(?=[A-Z])', cleaned) if p.strip()]
    # Re-split on | for the 'and' separator
    final_parts = []
    for p in parts:
        for sub in p.split('|'):
            sub = sub.strip()
            if sub:
                final_parts.append(sub)

    apa_parts = []
    for p in final_parts:
        tokens = p.split()
        if not tokens:
            continue
        # Find surname: last token without a dot, or last token overall
        surname_idx = None
        for idx in range(len(tokens) - 1, -1, -1):
            if not tokens[idx].endswith('.'):
                surname_idx = idx
                break
        if surname_idx is not None and surname_idx > 0:
            surname  = tokens[surname_idx]
            initials = ' '.join(tokens[:surname_idx])
            apa_parts.append(f"{surname}, {initials}")
        elif surname_idx == 0 and len(tokens) > 1:
            # surname first already (APA input)
            apa_parts.append(p)
        else:
            apa_parts.append(p)

    if not apa_parts:
        return authors
    if len(apa_parts) == 1:
        return apa_parts[0]
    return ', '.join(apa_parts[:-1]) + ', & ' + apa_parts[-1]


def _apa_authors_to_ieee(authors: str) -> str:
    """
    Convert APA  'Smith, A. B., & Jones, C.'
    to IEEE  'A. B. Smith and C. Jones'
    """
    parts = re.split(r',\s*&\s*|,\s*and\s*|;\s*', authors)
    parts = [p.strip() for p in parts if p.strip()]

    ieee_parts = []
    for p in parts:
        # APA format: Surname, I. I.
        m = re.match(r'^([^,]+),\s*(.+)$', p)
        if m:
            surname  = m.group(1).strip()
            initials = m.group(2).strip()
            ieee_parts.append(f"{initials} {surname}")
        else:
            ieee_parts.append(p)

    if not ieee_parts:
        return authors
    if len(ieee_parts) == 1:
        return ieee_parts[0]
    return ', '.join(ieee_parts[:-1]) + ', and ' + ieee_parts[-1]


def _apa_authors_to_mla(authors: str) -> str:
    """
    Convert APA  'Smith, A. B., & Jones, C.'
    to MLA  'Smith, A. B., and C. Jones'
    (first author Last, First — rest normal order)
    """
    parts = re.split(r',\s*&\s*|,\s*and\s*|;\s*', authors)
    parts = [p.strip() for p in parts if p.strip()]
    if not parts:
        return authors
    if len(parts) == 1:
        return parts[0]
    # First author stays Last, First; rest flip
    rest = []
    for p in parts[1:]:
        m = re.match(r'^([^,]+),\s*(.+)$', p)
        rest.append(f"{m.group(2).strip()} {m.group(1).strip()}" if m else p)
    return parts[0] + ', and ' + ', '.join(rest)


def _ieee_authors_to_mla(authors: str) -> str:
    """IEEE 'A. Smith, B. Jones' → MLA 'Smith, A., and B. Jones'"""
    apa = _ieee_authors_to_apa(authors)
    return _apa_authors_to_mla(apa)


def _fmt_apa(f: dict) -> str:
    authors = _ieee_authors_to_apa(f['authors']) if f['authors'] else '[Author Missing]'
    year    = f['year']    or '[Year Missing]'
    title   = f['title']   or '[Title Missing]'
    journal = f['journal'] or '[Journal Missing]'
    s = f"{authors} ({year}). {title}. _{journal}_"
    if f['volume']:
        s += f", {f['volume']}"
        if f['issue']:
            s += f"({f['issue']})"
    if f['pages']:
        s += f", {f['pages']}"
    s += f". {f['doi']}" if f['doi'] else "."
    return s


def _fmt_mla(f: dict) -> str:
    authors = _ieee_authors_to_mla(f['authors']) if f['authors'] else '[Author Missing]'
    title   = f['title']   or '[Title Missing]'
    journal = f['journal'] or '[Journal Missing]'
    year    = f['year']    or '[Year Missing]'
    s = f'{authors}. "{title}." _{journal}_'
    if f['volume']:
        s += f", vol. {f['volume']}"
    if f['issue']:
        s += f", no. {f['issue']}"
    s += f", {year}"
    if f['pages']:
        s += f", pp. {f['pages']}"
    s += f". {f['doi']}." if f['doi'] else "."
    return s


def _fmt_ieee(f: dict, num: int) -> str:
    authors = f['authors'] or '[Author Missing]'
    title   = f['title']   or '[Title Missing]'
    journal = f['journal'] or '[Journal Missing]'
    year    = f['year']    or '[Year Missing]'
    s = f'[{num}] {authors}, "{title}," _{journal}_'
    if f['volume']:
        s += f", vol. {f['volume']}"
    if f['issue']:
        s += f", no. {f['issue']}"
    if f['pages']:
        s += f", pp. {f['pages']}"
    s += f", {year}."
    return s


def extract_citations(text: str, style: str = "APA") -> dict:
    """
    Extract references using regex, parse fields, reformat in chosen style.
    Pure Python — no LLM calls. Style is always applied correctly.
    """
    raw_refs = _extract_references_section(text)
    if not raw_refs:
        return {"citations": [],
                "warning": "No references section found in this paper."}

    citations = []
    for i, ref in enumerate(raw_refs):
        f = _parse_ref(ref)
        if style == "MLA":
            formatted = _fmt_mla(f)
        elif style == "IEEE":
            formatted = _fmt_ieee(f, i + 1)
        else:
            formatted = _fmt_apa(f)

        citations.append({
            "id":               i + 1,
            "raw":              ref,
            "formatted":        formatted,
            "has_missing_fields": "Missing]" in formatted,
        })

    return {"citations": citations}


# ─────────────────────────────────────────────────────────────
# IDEAS
# ─────────────────────────────────────────────────────────────

IDEAS_PROMPT = """You are an expert academic research mentor. Based on the research paper text below, generate 8 creative and specific future research ideas that directly build on, extend, or address limitations of this paper.

Return ONLY this JSON format, nothing else:

{{
  "paper_title": "Short title of the paper",
  "ideas": [
    {{
      "id": 1,
      "title": "Short idea title (5-8 words)",
      "description": "2-3 sentence description of the research idea, why it matters, and how it extends this paper.",
      "type": "Extension | Gap | Application | Improvement",
      "difficulty": "Easy | Medium | Hard"
    }}
  ]
}}

Types:
- Extension: Builds directly on the paper's method or findings
- Gap: Addresses something the paper explicitly left as future work
- Application: Applies the paper's approach to a new domain
- Improvement: Improves a known weakness or limitation

Return ONLY valid JSON. No markdown, no explanation, no code fences.

Paper text:
---
{text}
---"""


def generate_ideas(text: str) -> dict:
    truncated = text[:12000]
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=2000,
        timeout=60,
        messages=[{"role": "user", "content": IDEAS_PROMPT.format(text=truncated)}]
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    start = raw.find("{")
    end   = raw.rfind("}") + 1
    if start != -1 and end > start:
        raw = raw[start:end]
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        return {"error": "Failed to parse ideas response.", "raw": raw}

# ─────────────────────────────────────────────────────────────
# INSIGHTS
# ─────────────────────────────────────────────────────────────
INSIGHTS_PROMPT = """
You are an expert research analyst.

Extract key insights from the research paper and return in EXACT JSON format:

{
  "problem": "...",
  "contributions": ["...", "..."],
  "method": "...",
  "performance": {
    "accuracy": "...",
    "precision": "...",
    "recall": "..."
  },
  "dataset": "...",
  "limitations": ["...", "..."]
}

Paper:
{text}
"""


def generate_insights(text: str):
    truncated = text[:12000]

    prompt = f"""
Extract insights from this research paper.

Return in this EXACT format (no JSON):

Problem:
...

Contributions:
- ...
- ...

Method:
...

Performance:
Accuracy: ...
Precision: ...
Recall: ...

Dataset:
...

Limitations:
- ...
- ...

Paper:
{truncated}
"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=1200,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = response.choices[0].message.content
    print("RAW OUTPUT:\n", raw)

    # 🔥 Convert structured text → dict manually
    return parse_insights(raw)

def parse_insights(text):
    def extract_section(start, end=None):
        if end:
            return text.split(start)[-1].split(end)[0].strip()
        return text.split(start)[-1].strip()

    try:
        return {
            "problem": extract_section("Problem:", "Contributions:"),

            "contributions": [
                line.strip("- ").strip()
                for line in extract_section("Contributions:", "Method:").split("\n")
                if line.strip().startswith("-")
            ],

            "method": extract_section("Method:", "Performance:"),

            "performance": {
                "accuracy": extract_section("Accuracy:", "Precision:"),
                "precision": extract_section("Precision:", "Recall:"),
                "recall": extract_section("Recall:", "Dataset:")
            },

            "dataset": extract_section("Dataset:", "Limitations:"),

            "limitations": [
                line.strip("- ").strip()
                for line in extract_section("Limitations:").split("\n")
                if line.strip().startswith("-")
            ]
        }

    except Exception as e:
        print("PARSING ERROR:", str(e))
        return {
            "problem": "Parsing failed",
            "contributions": [],
            "method": text[:500],
            "performance": {},
            "dataset": "",
            "limitations": []
        }