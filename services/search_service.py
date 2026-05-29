import requests

SEMANTIC_SCHOLAR_API = "https://api.semanticscholar.org/graph/v1/paper/search"

FIELDS = (
    "title,authors,year,venue,externalIds,openAccessPdf,"
    "citationCount,publicationTypes,fieldsOfStudy,abstract,url"
)


def search_papers(query: str, limit: int = 20, offset: int = 0,
                  year_from: int = None, year_to: int = None,
                  pub_types: list = None, open_access_only: bool = False,
                  sort: str = "relevance") -> dict:
    """
    Search Semantic Scholar for research papers.
    Returns a dict with 'papers', 'total', and 'fields_of_study'.
    """
    params = {
        "query": query,
        "limit": min(limit, 100),
        "offset": offset,
        "fields": FIELDS,
    }

    # Year range filter
    if year_from or year_to:
        y_from = str(year_from) if year_from else ""
        y_to = str(year_to) if year_to else ""
        params["year"] = f"{y_from}-{y_to}"

    # Publication type filter
    if pub_types:
        # Semantic Scholar accepts: JournalArticle, Conference, Review, Book, Thesis
        type_map = {
            "journal": "JournalArticle",
            "conference": "Conference",
            "review": "Review",
            "thesis": "Book",       # closest available
            "preprint": "JournalArticle",
        }
        mapped = [type_map[t] for t in pub_types if t in type_map]
        if mapped:
            params["publicationTypes"] = ",".join(set(mapped))

    # Open access filter
    if open_access_only:
        params["openAccessPdf"] = ""

    # Sort order
    if sort == "citations":
        params["sort"] = "citationCount:desc"
    elif sort == "latest":
        params["sort"] = "publicationDate:desc"
    elif sort == "oldest":
        params["sort"] = "publicationDate:asc"
    # relevance is default (no param needed)

    try:
        import os
        headers = {}
        api_key = os.environ.get('S2_API_KEY', '')
        if api_key:
         headers['x-api-key'] = api_key
        resp = requests.get(SEMANTIC_SCHOLAR_API, params=params, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.RequestException as e:
        return {"error": str(e), "papers": [], "total": 0, "fields_of_study": []}

    raw_papers = data.get("data", [])
    total = data.get("total", 0)

    papers = []
    all_fields = set()

    for p in raw_papers:
        # Collect dynamic fields of study
        for f in (p.get("fieldsOfStudy") or []):
            all_fields.add(f)

        # Determine PDF url
        oa = p.get("openAccessPdf") or {}
        pdf_url = oa.get("url", None)

        # Authors — list of name strings
        authors = [a.get("name", "") for a in (p.get("authors") or [])]

        # Publication type label
        types = p.get("publicationTypes") or []
        pub_type_label = _map_pub_type(types)

        papers.append({
            "id": p.get("paperId", ""),
            "title": p.get("title", "Untitled"),
            "authors": authors,
            "year": p.get("year"),
            "venue": p.get("venue") or "",
            "abstract": p.get("abstract") or "",
            "citation_count": p.get("citationCount", 0),
            "pdf_url": pdf_url,
            "paper_url": p.get("url") or _build_ss_url(p.get("paperId")),
            "pub_type": pub_type_label,
            "fields_of_study": p.get("fieldsOfStudy") or [],
            "open_access": bool(pdf_url),
        })

    return {
        "papers": papers,
        "total": total,
        "fields_of_study": sorted(all_fields),
    }


def _map_pub_type(types: list) -> str:
    if not types:
        return "Article"
    t = types[0]
    mapping = {
        "JournalArticle": "Journal Article",
        "Conference": "Conference Paper",
        "Review": "Review / Survey",
        "Book": "Thesis / Book",
        "Preprint": "Preprint",
    }
    return mapping.get(t, t)


def _build_ss_url(paper_id: str) -> str:
    if paper_id:
        return f"https://www.semanticscholar.org/paper/{paper_id}"
    return ""
