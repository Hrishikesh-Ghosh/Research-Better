const API = "/api/qa";

const select = document.getElementById("paper-select");
const chatBox = document.getElementById("chat-box");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

let history = [];

// Load papers
async function loadPapers() {
  const res = await fetch(`${API}/papers`);
  const data = await res.json();

  select.innerHTML = `<option value="">Select</option>`;

  data.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.title;
    select.appendChild(opt);
  });
}

loadPapers();

// Send message
sendBtn.onclick = async () => {
  const question = input.value.trim();
  const paper_id = select.value;

  if (!question || !paper_id) {
    alert("Select paper and enter question");
    return;
  }

  addMessage(question, "user");
  input.value = "";

  try {
    const res = await fetch("/api/qa/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        paper_id,
        question,
        history
      })
    });

    const data = await res.json();

    if (data.error) {
      addMessage("Error: " + data.error, "bot");
      return;
    }

    addMessage(data.answer, "bot");

    history.push({
      q: question,
      a: data.answer
    });

  } catch (err) {
    addMessage("Failed to get response", "bot");
    console.error(err);
  }
};

// Render messages
function addMessage(text, type) {
  const div = document.createElement("div");

  if (type === "user") {
    div.className = "user-msg";
  } else {
    div.className = "bot-msg";
  }

  div.innerText = text;

  document.getElementById("chat-box").appendChild(div);
}

// Share chat (download)
document.getElementById("share-btn").onclick = () => {
  if (history.length === 0) {
    alert("No chat to share");
    return;
  }

  let text = "Chat Export\n\n";

  history.forEach((h, i) => {
    text += `Q${i+1}: ${h.q}\nA${i+1}: ${h.a}\n\n`;
  });

  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "chat.txt";
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
};