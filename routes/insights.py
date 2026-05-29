from flask import Blueprint, jsonify, request
from models import Paper
from services.claude_service import generate_insights

insights_bp = Blueprint("insights", __name__, url_prefix="/api/insights")


@insights_bp.route("/papers", methods=["GET"])
def list_papers():
    papers = Paper.query.filter_by(source="upload").all()
    return jsonify([
        {"id": p.id, "title": p.title}
        for p in papers
    ])


@insights_bp.route("/generate/<int:paper_id>", methods=["POST"])
def generate(paper_id):
    try:
        paper = Paper.query.get(paper_id)

        if not paper:
            return jsonify({"error": "Paper not found"}), 404

        from services.pdf_service import extract_text_from_pdf

        print("Reading file:", paper.pdf_path)

        text = extract_text_from_pdf(paper.pdf_path)

        print("Extracted text length:", len(text))

        from services.claude_service import generate_insights
        result = generate_insights(text)

        return jsonify(result)

    except Exception as e:
        print("🔥 ERROR:", str(e))
        return jsonify({"error": str(e)}), 500