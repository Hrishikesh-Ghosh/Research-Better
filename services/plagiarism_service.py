from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def check_similarity(text1, text2):
    # Basic similarity
    vectorizer = TfidfVectorizer(stop_words="english")

    tfidf = vectorizer.fit_transform([text1, text2])
    score = cosine_similarity(tfidf[0:1], tfidf[1:2])[0][0]

    similarity_percent = round(score * 100)

    # BONUS: line-level similarity
    matches = find_similar_lines(text1, text2)

    return {
        "score": similarity_percent,
        "matches": matches
    }


def find_similar_lines(text1, text2):
    lines1 = [l.strip() for l in text1.split("\n") if len(l.strip()) > 30]
    lines2 = [l.strip() for l in text2.split("\n") if len(l.strip()) > 30]

    vectorizer = TfidfVectorizer(stop_words="english")

    matches = []

    for l1 in lines1[:50]:  # limit for speed
        for l2 in lines2[:50]:
            tfidf = vectorizer.fit_transform([l1, l2])
            sim = cosine_similarity(tfidf[0:1], tfidf[1:2])[0][0]

            if sim > 0.7:
                matches.append({
                    "text1": l1,
                    "text2": l2,
                    "score": round(sim * 100)
                })

    return matches[:10]  # limit output