import os
import uuid
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from services.pdf_service import extract_text_from_pdf, get_pdf_metadata
from services.claude_service import compare_papers
from models import db, Paper

compare_bp = Blueprint("compare", __name__, url_prefix="/api/compare")

ALLOWED_EXTENSIONS = {"pdf"}


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@compare_bp.route("/upload", methods=["POST"])
def upload_pdf():
    """
    POST /api/compare/upload
    Same upload endpoint as summary but under compare prefix.
    Returns: { paper_id, filename, title, pages }
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files["file"]
    if not file.filename or not allowed_file(file.filename):
        return jsonify({"error": "Invalid file. Only PDF files are accepted."}), 400

    upload_folder = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(upload_folder, exist_ok=True)

    original_name = secure_filename(file.filename)
    unique_name   = f"{uuid.uuid4().hex}_{original_name}"
    save_path     = os.path.join(upload_folder, unique_name)
    file.save(save_path)

    try:
        meta = get_pdf_metadata(save_path)
    except Exception:
        meta = {"title": original_name, "author": "", "pages": 0}

    paper = Paper(
        title    = meta.get("title") or original_name,
        authors  = meta.get("author") or "",
        pdf_path = save_path,
        source   = "upload",
    )
    db.session.add(paper)
    db.session.commit()

    return jsonify({
        "paper_id": paper.id,
        "filename": original_name,
        "title":    paper.title,
        "pages":    meta.get("pages", 0),
    }), 201


@compare_bp.route("/papers", methods=["GET"])
def list_papers():
    """
    GET /api/compare/papers
    Returns all uploaded papers for populating dropdowns.
    """
    papers = Paper.query.filter_by(source="upload").order_by(Paper.created_at.desc()).all()
    return jsonify([
        {"id": p.id, "title": p.title, "filename": os.path.basename(p.pdf_path or "")}
        for p in papers
    ])


@compare_bp.route("/generate", methods=["POST"])
def generate_comparison():
    """
    POST /api/compare/generate
    Body: { "paper_ids": [1, 2] } or { "paper_ids": [1, 2, 3] }
    Returns comparison table data and recommendation.
    """
    body = request.get_json(silent=True) or {}
    paper_ids = body.get("paper_ids", [])

    if not isinstance(paper_ids, list) or len(paper_ids) < 2:
        return jsonify({"error": "At least 2 paper IDs are required."}), 400

    if len(paper_ids) > 3:
        return jsonify({"error": "Maximum 3 papers can be compared at once."}), 400

    texts  = []
    titles = []

    for pid in paper_ids:
        paper = Paper.query.get(pid)
        if not paper:
            return jsonify({"error": f"Paper with ID {pid} not found."}), 404
        if not paper.pdf_path or not os.path.exists(paper.pdf_path):
            return jsonify({"error": f"PDF file missing for paper: {paper.title}"}), 404

        try:
            text = extract_text_from_pdf(paper.pdf_path)
        except Exception as e:
            return jsonify({"error": f"Could not extract text from '{paper.title}': {str(e)}"}), 422

        texts.append(text)
        titles.append(paper.title)

    try:
        result = compare_papers(texts, titles)
    except Exception as e:
        return jsonify({"error": f"Comparison failed: {str(e)}"}), 502

    if "error" in result:
        return jsonify({"error": result["error"]}), 502

    return jsonify(result)