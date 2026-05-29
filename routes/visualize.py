from flask import Blueprint, jsonify, request
from models import Paper
from services.pdf_service import extract_text_from_pdf
from collections import Counter
import re

visualize_bp = Blueprint("visualize", __name__, url_prefix="/api/visualize")


@visualize_bp.route("/papers", methods=["GET"])
def list_papers():
    papers = Paper.query.filter_by(source="upload").all()
    return jsonify([{"id": p.id, "title": p.title} for p in papers])


@visualize_bp.route("/generate", methods=["POST"])
def generate():
    data = request.json
    paper_id = data.get("paper_id")
    chart_type = data.get("type")

    paper = Paper.query.get(paper_id)

    if not paper:
        return jsonify({"error": "Paper not found"}), 404

    text = extract_text_from_pdf(paper.pdf_path)

    if not text:
        return jsonify({"error": "Empty PDF"}), 400

    # -------- BAR CHART (Topic Frequency) --------
    if chart_type == "bar":
        words = re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())
        stopwords = set(["this", "that", "with", "from", "have", "using", "paper", "model"])
        filtered = [w for w in words if w not in stopwords]

        freq = Counter(filtered).most_common(40)

        return jsonify({
            "labels": [w for w, _ in freq],
            "values": [c for _, c in freq]
        })

    # -------- SECTION IMPORTANCE --------
    elif chart_type == "section":
        sections = {
            "Introduction": len(re.findall("introduction", text.lower())),
            "Method": len(re.findall("method", text.lower())),
            "Results": len(re.findall("result", text.lower())),
            "Conclusion": len(re.findall("conclusion", text.lower()))
        }

        return jsonify({
            "labels": list(sections.keys()),
            "values": list(sections.values())
        })

    # -------- WORD CLOUD --------
    elif chart_type == "wordcloud":
        words = re.findall(r'\b[a-zA-Z]{5,}\b', text.lower())

        # 🔥 Strong stopword filter
        stopwords = {
            "this","that","with","from","have","using","paper","model",
            "width","these","those","their","there","been","being","also",
            "such","into","than","then","them","they","were","where",
            "when","which","while","about","between","within","without",
            "because","however","therefore","thus","based","used","use",
            "data","result","results","method","methods","approach"
        }

        # Remove useless words
        filtered = [w for w in words if w not in stopwords]

        # Count frequency
        freq = Counter(filtered).most_common(40)

        # Return EXACT format required by wordcloud2.js
        return jsonify([[w, int(c)] for w, c in freq])