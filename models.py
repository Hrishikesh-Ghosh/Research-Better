from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Paper(db.Model):
    """Stores uploaded or saved research papers."""
    __tablename__ = 'papers'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(500), nullable=False)
    authors = db.Column(db.String(500))
    year = db.Column(db.Integer)
    venue = db.Column(db.String(300))          # journal / conference
    abstract = db.Column(db.Text)
    url = db.Column(db.String(1000))           # external link (web search results)
    pdf_path = db.Column(db.String(500))       # local file path (uploaded PDFs)
    source = db.Column(db.String(50), default='upload')  # 'upload' | 'web'
    paper_type = db.Column(db.String(50))      # Experimental | Survey/Review | Comparative
    domain = db.Column(db.String(200))         # comma-separated domains
    citation_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'authors': self.authors,
            'year': self.year,
            'venue': self.venue,
            'abstract': self.abstract,
            'url': self.url,
            'pdf_path': self.pdf_path,
            'source': self.source,
            'paper_type': self.paper_type,
            'domain': self.domain,
            'citation_count': self.citation_count,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Conversation(db.Model):
    """Stores conversation history per paper or session."""
    __tablename__ = 'conversations'

    id = db.Column(db.Integer, primary_key=True)
    paper_id = db.Column(db.Integer, db.ForeignKey('papers.id'), nullable=True)
    session_id = db.Column(db.String(100))
    role = db.Column(db.String(20))   # 'user' | 'assistant'
    content = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'paper_id': self.paper_id,
            'session_id': self.session_id,
            'role': self.role,
            'content': self.content,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
