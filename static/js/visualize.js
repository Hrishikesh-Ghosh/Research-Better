const API = "/api/visualize";

const select = document.getElementById("paper-select");
const btn = document.getElementById("btn-visualize");

let chart;

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

// Handle visualize
btn.onclick = async () => {
  const paper_id = select.value;
  const type = document.querySelector('input[name="viz"]:checked')?.value;

  if (!paper_id || !type) {
    alert("Select paper and diagram type");
    return;
  }

  const res = await fetch(`${API}/generate`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ paper_id, type })
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Server error:", text);
    alert("Visualization failed (check console)");
    return;
  }

  const data = await res.json();
  if (!data || (Array.isArray(data) && data.length === 0)) {
    alert("No data extracted from PDF");
    return;
  }
  console.log("DATA:", data);

  // Clear previous
  document.getElementById("wordcloud").innerHTML = "";

  if (chart) {
    chart.destroy();
    chart = null;
  }

  const canvas = document.getElementById("chart");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (type === "wordcloud") {

    const wc = document.getElementById("wordcloud");

    // Clear chart + previous content
    wc.innerHTML = "";

    if (chart) {
      chart.destroy();
      chart = null;
    }

    const canvas = document.getElementById("chart");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    console.log("WordCloud data:", data);

    // 🔥 STRICT VALIDATION
    const list = data;

    // ✅ PASS CLEAN DATA ONLY
    WordCloud(wc, {
      list: list,
      gridSize: 8,
      weightFactor: 5
    });
  } else {
    const ctx = document.getElementById("chart").getContext("2d");

    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.labels,
        datasets: [{
          label: "Values",
          data: data.values
        }]
      }
    });
  }
};
