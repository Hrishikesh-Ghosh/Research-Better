from flask import Blueprint, jsonify, request
from models import Paper
from services.pdf_service import extract_text_from_pdf
from services.plagiarism_service import check_similarity

plagiarism_bp = Blueprint("plagiarism", __name__, url_prefix="/api/plagiarism")


@plagiarism_bp.route("/papers", methods=["GET"])
def list_papers():
    papers = Paper.query.filter_by(source="upload").all()
    return jsonify([{"id": p.id, "title": p.title} for p in papers])


@plagiarism_bp.route("/check", methods=["POST"])
def check():
    data = request.json
    id1 = data.get("paper1")
    id2 = data.get("paper2")

    p1 = Paper.query.get(id1)
    p2 = Paper.query.get(id2)

    if not p1 or not p2:
        return jsonify({"error": "Invalid papers"}), 400

    text1 = extract_text_from_pdf(p1.pdf_path)
    text2 = extract_text_from_pdf(p2.pdf_path)

    result = check_similarity(text1, text2)

    return jsonify(result)