import os
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
import uuid
from services.pdf_service import extract_text_from_pdf, get_pdf_metadata
from services.claude_service import extract_citations
from models import db, Paper

citations_bp = Blueprint("citations", __name__, url_prefix="/api/citations")

ALLOWED_EXTENSIONS = {"pdf"}


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@citations_bp.route("/upload", methods=["POST"])
def upload_pdf():
    """
    POST /api/citations/upload
    Upload a PDF for citation extraction.
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


@citations_bp.route("/generate/<int:paper_id>", methods=["POST"])
def generate_citations(paper_id: int):
    paper = Paper.query.get(paper_id)
    if not paper:
        return jsonify({"error": "Paper not found."}), 404

    if not paper.pdf_path or not os.path.exists(paper.pdf_path):
        return jsonify({"error": "PDF file not found on server."}), 404

    body  = request.get_json(silent=True) or {}
    style = body.get("style", "APA").upper()
    if style not in ("APA", "MLA", "IEEE"):
        style = "APA"

    try:
        text = extract_text_from_pdf(paper.pdf_path)
    except (FileNotFoundError, ValueError) as e:
        return jsonify({"error": str(e)}), 422

    try:
        result = extract_citations(text, style=style)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Citation extraction failed: {str(e)}"}), 502

    return jsonify({
        "paper_id":  paper.id,
        "title":     paper.title,
        "style":     style,
        "citations": result.get("citations", []),
        "warning":   result.get("warning", None),
    })


@citations_bp.route("/papers", methods=["GET"])
def list_papers():
    """GET /api/citations/papers — populate dropdown"""
    papers = Paper.query.filter_by(source="upload").order_by(Paper.created_at.desc()).all()
    return jsonify([
        {"id": p.id, "title": p.title, "filename": os.path.basename(p.pdf_path or "")}
        for p in papers
    ])