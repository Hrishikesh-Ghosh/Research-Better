from flask import Blueprint, render_template, request, redirect, url_for, send_from_directory, flash
import os, uuid
from werkzeug.utils import secure_filename
from models import db

ui_bp = Blueprint("ui", __name__)

UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {"pdf"}


# ---- MODEL (reuse your existing Document OR merge with Paper later) ----
from models import Paper as Document   # 🔥 reuse same table


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


# -------- ROUTES --------

@ui_bp.route("/")
def upload_page():
    return render_template("upload.html")


@ui_bp.route("/upload", methods=["POST"])
def upload_file():
    files = request.files.getlist("files")

    for file in files:
        if file and file.filename != "":
            if not allowed_file(file.filename):
                flash("Only PDF uploads supported")
                return redirect(url_for("ui.upload_page"))

            original_filename = secure_filename(file.filename)
            unique_filename = str(uuid.uuid4()) + "_" + original_filename

            filepath = os.path.join(UPLOAD_FOLDER, unique_filename)
            file.save(filepath)

            doc = Document(
                title=original_filename,
                pdf_path=filepath,
                source="upload"
            )
            db.session.add(doc)

    db.session.commit()
    return redirect(url_for("ui.dashboard"))


@ui_bp.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@ui_bp.route("/library")
def library():
    search_query = request.args.get("search")

    if search_query:
        documents = Document.query.filter(Document.title.contains(search_query)).all()
    else:
        documents = Document.query.all()

    return render_template(
        "library.html",
        documents=documents,
        search_query=search_query,
        is_searching=bool(search_query)
    )


@ui_bp.route("/delete/<int:doc_id>")
def delete_file(doc_id):
    doc = Document.query.get(doc_id)

    if doc:
        if doc.pdf_path and os.path.exists(doc.pdf_path):
            os.remove(doc.pdf_path)

        db.session.delete(doc)
        db.session.commit()

    return redirect(url_for("ui.library"))


@ui_bp.route("/view/<int:doc_id>")
def view_file(doc_id):
    doc = Document.query.get(doc_id)

    if doc:
        return send_from_directory(
            os.path.dirname(doc.pdf_path),
            os.path.basename(doc.pdf_path)
        )

    return "File not found", 404


@ui_bp.route("/summary")
def summary_page():
    return render_template("summary.html")


@ui_bp.route("/compare")
def compare_page():
    return render_template("compare.html")


@ui_bp.route("/search-page")
def search_page():
    return render_template("search.html")

@ui_bp.route("/citations")
def citations_page():
    return render_template("citations.html")

@ui_bp.route("/ideas")
def ideas_page():
    return render_template("ideas.html")

@ui_bp.route("/download/<int:doc_id>")
def download_file(doc_id):
    doc = Document.query.get(doc_id)

    if not doc or not doc.pdf_path:
        return "File not found", 404

    directory = os.path.dirname(doc.pdf_path)
    filename = os.path.basename(doc.pdf_path)

    return send_from_directory(
        directory,
        filename,
        as_attachment=True,
        download_name=doc.title
    )
@ui_bp.route("/insights")
def insights_page():
    return render_template("insights.html")

@ui_bp.route("/plagiarism")
def plagiarism_page():
    return render_template("plagiarism.html")

@ui_bp.route("/qa")
def qa_page():
    return render_template("qa.html")

@ui_bp.route("/visualize")
def visualize_page():
    return render_template("visualize.html")
