from flask import Blueprint, request, jsonify
from models import Paper
from services.pdf_service import extract_text_from_pdf
from services.qa_service import answer_question

qa_bp = Blueprint("qa", __name__, url_prefix="/api/qa")


@qa_bp.route("/papers", methods=["GET"])
def list_papers():
    papers = Paper.query.filter_by(source="upload").all()
    return jsonify([{"id": p.id, "title": p.title} for p in papers])


@qa_bp.route("/ask", methods=["POST"])
def ask():
    data = request.json
    paper_id = data.get("paper_id")
    question = data.get("question")
    history = data.get("history", [])

    paper = Paper.query.get(paper_id)

    if not paper:
        return jsonify({"error": "Paper not found"}), 404

    text = extract_text_from_pdf(paper.pdf_path)

    answer = answer_question(text, question, history)

    return jsonify({"answer": answer})