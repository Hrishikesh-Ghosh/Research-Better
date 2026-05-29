import os
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
import uuid
from services.pdf_service import extract_text_from_pdf, get_pdf_metadata
from services.claude_service import generate_ideas
from models import db, Paper

ideas_bp = Blueprint("ideas", __name__, url_prefix="/api/ideas")

ALLOWED_EXTENSIONS = {"pdf"}


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@ideas_bp.route("/upload", methods=["POST"])
def upload_pdf():
    """
    POST /api/ideas/upload
    Upload a PDF for research idea generation.
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


@ideas_bp.route("/generate/<int:paper_id>", methods=["POST"])
def generate_research_ideas(paper_id: int):
    """
    POST /api/ideas/generate/<paper_id>
    Generate future research ideas from the stored PDF.
    Returns: { paper_id, title, paper_title, ideas: [{id, title, description, type, difficulty}] }
    """
    paper = Paper.query.get(paper_id)
    if not paper:
        return jsonify({"error": "Paper not found."}), 404

    if not paper.pdf_path or not os.path.exists(paper.pdf_path):
        return jsonify({"error": "PDF file not found on server."}), 404

    try:
        text = extract_text_from_pdf(paper.pdf_path)
    except (FileNotFoundError, ValueError) as e:
        return jsonify({"error": str(e)}), 422

    try:
        result = generate_ideas(text)
    except Exception as e:
        return jsonify({"error": f"Idea generation failed: {str(e)}"}), 502

    if "error" in result:
        return jsonify({"error": result["error"]}), 502

    return jsonify({
        "paper_id":    paper.id,
        "title":       paper.title,
        "paper_title": result.get("paper_title", paper.title),
        "ideas":       result.get("ideas", []),
    })


@ideas_bp.route("/papers", methods=["GET"])
def list_papers():
    """GET /api/ideas/papers — populate dropdown"""
    papers = Paper.query.filter_by(source="upload").order_by(Paper.created_at.desc()).all()
    return jsonify([
        {"id": p.id, "title": p.title, "filename": os.path.basename(p.pdf_path or "")}
        for p in papers
    ])