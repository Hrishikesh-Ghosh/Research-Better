const API = "/api/insights";

const select = document.getElementById("paper-select");
const btn = document.getElementById("btn-generate");
const container = document.getElementById("insights-container");

// LOAD PAPERS
async function loadPapers() {
  try {
    const res = await fetch(`${API}/papers`);
    let data;

    try {
      data = await res.json();
    } catch (err) {
      const text = await res.text();
      console.error("RAW RESPONSE:", text);
      container.innerHTML = "Failed to load insights.";
      return;
    }

    select.innerHTML = `<option value="">Select</option>`;

    data.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.title;
      select.appendChild(opt);
    });

  } catch (err) {
    console.error("Error loading papers:", err);
  }
}

loadPapers();

// BUTTON CLICK
btn.addEventListener("click", async () => {
  const id = select.value;

  if (!id) {
    alert("Please select a paper");
    return;
  }

  container.innerHTML = "Loading insights...";

  try {
    const res = await fetch(`${API}/generate/${id}`, {
      method: "POST"
    });

    const data = await res.json();

    if (data.error) {
      container.innerHTML = "Failed to load insights.";
      return;
    }

    render(data);

  } catch (err) {
    console.error(err);
    container.innerHTML = "Failed to load insights.";
  }
});


// RENDER UI (CARDS)
function render(data) {
  container.innerHTML = `
    <div style="
      display:grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      max-width: 1200px;
      margin: 0 auto;
    ">

      <div class="summary-section">
        <h3>Problem Addressed</h3>
        <p>${data.problem || "N/A"}</p>
      </div>

      <div class="summary-section">
        <h3>Main Contributions</h3>
        <ul>
          ${(data.contributions || []).map(c => `<li>${c}</li>`).join("")}
        </ul>
      </div>

      <div class="summary-section">
        <h3>Proposed Method</h3>
        <p>${data.method || "N/A"}</p>
      </div>

      <div class="summary-section">
        <h3>Dataset Information</h3>
        <p>${data.dataset || "N/A"}</p>
      </div>

      <div class="summary-section">
        <h3>Performance Highlights</h3>
        <p>Accuracy: ${data.performance?.accuracy || "N/A"}</p>
        <p>Precision: ${data.performance?.precision || "N/A"}</p>
        <p>Recall: ${data.performance?.recall || "N/A"}</p>
      </div>

      <div class="summary-section">
        <h3>Limitations</h3>
        <ul>
          ${(data.limitations || []).map(l => `<li>${l}</li>`).join("")}
        </ul>
      </div>

    </div>
  `;
}