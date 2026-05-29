from flask import Flask
from flask_cors import CORS
from config import Config
from models import db
import os

from dotenv import load_dotenv
load_dotenv()

# Import ALL routes
from routes.ui_routes import ui_bp
from routes.summary import summary_bp
from routes.compare import compare_bp
from routes.search import search_bp
from routes.citations import citations_bp
from routes.ideas import ideas_bp
from routes.insights import insights_bp
from routes.plagiarism import plagiarism_bp
from routes.qa import qa_bp
from routes.visualize import visualize_bp

def create_app():
    app = Flask(__name__)

    # Load config
    app.config.from_object(Config)

    # Enable CORS (for API if needed)
    CORS(app)

    # Init DB
    db.init_app(app)

    # Ensure upload folder exists
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    # Register blueprints
    app.register_blueprint(ui_bp)          # UI routes
    app.register_blueprint(summary_bp)     # /api/summary
    app.register_blueprint(compare_bp)     # /api/compare
    app.register_blueprint(search_bp)      # /api/search
    app.register_blueprint(citations_bp)   # /api/citations
    app.register_blueprint(ideas_bp)       # /api/ideas
    app.register_blueprint(insights_bp)    # /api/insights
    app.register_blueprint(plagiarism_bp)  # /api/plagiarism
    app.register_blueprint(qa_bp)          # /api/qa
    app.register_blueprint(visualize_bp)   # /api/visualize 

    # Create DB tables
    with app.app_context():
        db.create_all()

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True)