from flask import Blueprint, request, jsonify
from services.search_service import search_papers

search_bp = Blueprint("search", __name__, url_prefix="/api/search")


@search_bp.route("/", methods=["GET"])
def search():
    """
    GET /api/search/
    Query params:
      q            - search query (required)
      page         - page number, 1-based (default 1)
      per_page     - results per page: 5 | 10 | 20 (default 10)
      year_from    - start year filter
      year_to      - end year filter
      pub_types    - comma-separated: journal,conference,review,thesis,preprint
      open_access  - "true" to filter open access only
      sort         - relevance | citations | latest | oldest
    """
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "Query parameter 'q' is required."}), 400

    # Pagination
    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = int(request.args.get("per_page", 10))
        if per_page not in (5, 10, 20):
            per_page = 10
    except ValueError:
        page, per_page = 1, 10

    offset = (page - 1) * per_page

    # Filters
    year_from = _safe_int(request.args.get("year_from"))
    year_to = _safe_int(request.args.get("year_to"))

    pub_types_raw = request.args.get("pub_types", "")
    pub_types = [t.strip() for t in pub_types_raw.split(",") if t.strip()] if pub_types_raw else []

    open_access = request.args.get("open_access", "false").lower() == "true"
    sort = request.args.get("sort", "relevance")

    result = search_papers(
        query=query,
        limit=per_page,
        offset=offset,
        year_from=year_from,
        year_to=year_to,
        pub_types=pub_types,
        open_access_only=open_access,
        sort=sort,
    )

    if "error" in result and not result["papers"]:
        return jsonify({"error": result["error"]}), 502

    total = result["total"]
    total_pages = max(1, -(-total // per_page))  # ceiling division

    return jsonify({
        "papers": result["papers"],
        "fields_of_study": result["fields_of_study"],
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": total_pages,
        },
    })


def _safe_int(val):
    try:
        return int(val) if val else None
    except (ValueError, TypeError):
        return None
