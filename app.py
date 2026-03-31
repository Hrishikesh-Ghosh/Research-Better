from flask import Flask, render_template, request, redirect, url_for
import os
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)

# ===== FILE UPLOAD CONFIG =====
UPLOAD_FOLDER = 'uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# ===== DATABASE CONFIG =====
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///documents.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# ===== DATABASE MODEL =====
class Document(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(200), nullable=False)


# ===== ROUTES =====

@app.route('/')
def upload_page():
    return render_template('upload.html')


@app.route('/upload', methods=['POST'])
def upload_file():
    files = request.files.getlist('files')

    for file in files:
        if file.filename != '':
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
            file.save(filepath)

            # Save to database
            new_doc = Document(filename=file.filename)
            db.session.add(new_doc)

    db.session.commit()
    return redirect(url_for('dashboard'))


@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')


@app.route('/library')
def library():
    search_query = request.args.get('search')
    is_searching = False

    if search_query:
        is_searching = True
        documents = Document.query.filter(
            Document.filename.contains(search_query)
        ).all()
    else:
        documents = Document.query.all()

    files = [doc.filename for doc in documents]

    return render_template(
        'library.html',
        files=files,
        search_query=search_query,
        is_searching=is_searching
    )


@app.route('/delete/<filename>')
def delete_file(filename):
    # Delete file from folder
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    # Delete from database
    doc = Document.query.filter_by(filename=filename).first()
    if doc:
        db.session.delete(doc)
        db.session.commit()

    return redirect(url_for('library'))


@app.route('/delete_all')
def delete_all():
    documents = Document.query.all()

    for doc in documents:
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], doc.filename)
        if os.path.exists(file_path):
            os.remove(file_path)

        db.session.delete(doc)

    db.session.commit()
    return redirect(url_for('library'))


# ===== RUN APP =====
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)