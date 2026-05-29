import os
from groq import Groq

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def answer_question(text, question, history):
    context = text[:12000]  # truncate for speed

    chat_history = ""
    for h in history:
        chat_history += f"User: {h['q']}\nAssistant: {h['a']}\n"

    prompt = f"""
You are a research assistant.

Use ONLY the provided paper content to answer.

Paper:
{context}

Conversation:
{chat_history}

Question:
{question}

Answer clearly:
"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}]
    )

    return response.choices[0].message.content