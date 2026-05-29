const API = "/api/plagiarism";

const p1 = document.getElementById("paper1");
const p2 = document.getElementById("paper2");
const btn = document.getElementById("btn-check");
const scoreBox = document.getElementById("score-box");
const matchesDiv = document.getElementById("matches");

// load papers
async function load() {
  const res = await fetch(`${API}/papers`);
  const data = await res.json();

  [p1, p2].forEach(select => {
    select.innerHTML = `<option value="">Select</option>`;
    data.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.title;
      select.appendChild(opt);
    });
  });
}

load();

btn.addEventListener("click", async () => {
  if (!p1.value || !p2.value) {
    alert("Select both papers");
    return;
  }

  scoreBox.textContent = "Loading...";

  const res = await fetch(`${API}/check`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      paper1: p1.value,
      paper2: p2.value
    })
  });

  const data = await res.json();

  scoreBox.textContent = data.score + "%";

  renderMatches(data.matches);
});

function renderMatches(matches) {
  matchesDiv.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      ${matches.map(m => `
        <div class="summary-section">${m.text1}</div>
        <div class="summary-section">${m.text2}</div>
      `).join("")}
    </div>
  `;
}