const API_BASE = "/api";

/* ── State ── */
const state = {
  selectedPaperId: null,   // paper ID from DB (existing papers)
  uploadedPaperId: null,   // paper ID after fresh upload
  uploadedFileName: null,
};

/* ── DOM refs ── */
const paperSelect    = document.getElementById("paper-select");
const fileInput      = document.getElementById("file-input");
const uploadTrigger  = document.getElementById("upload-trigger");
const fileBadge      = document.getElementById("file-badge");
const badgeFileName  = document.getElementById("badge-filename");
const removeFileBtn  = document.getElementById("remove-file");
const btnGenerate    = document.getElementById("btn-generate");
const summaryBox     = document.getElementById("summary-box");
const summaryTitle   = document.getElementById("summary-paper-title");
const sectionsWrap   = document.getElementById("sections-wrap");
const btnExport      = document.getElementById("btn-export");
const placeholder    = document.getElementById("state-placeholder");
const toast          = document.getElementById("toast");

/*Init — load existing papers into dropdown*/
async function init() {
  try {
    const res  = await fetch(`${API_BASE}/summary/papers`);
    const data = await res.json();

    // Clear existing options except the default
    paperSelect.innerHTML = `<option value="">Select a paper…</option>
      <option value="__upload__">📂 Upload new PDF…</option>`;

    if (data.length) {
      const divider = document.createElement("option");
      divider.disabled = true;
      divider.textContent = "── Saved papers ──";
      paperSelect.appendChild(divider);

      data.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.title || p.filename;
        paperSelect.appendChild(opt);
      });
    }
  } catch {
    // Backend may not be running yet; just show the upload option
    paperSelect.innerHTML = `<option value="">Select a paper…</option>
      <option value="__upload__">📂 Upload new PDF…</option>`;
  }
}

/*Event listeners*/
paperSelect.addEventListener("change", () => {
  const val = paperSelect.value;

  if (val === "__upload__") {
    // Reset select back, trigger file picker
    paperSelect.value = "";
    fileInput.click();
    return;
  }

  if (val) {
    state.selectedPaperId  = parseInt(val);
    state.uploadedPaperId  = null;
    state.uploadedFileName = null;
    fileBadge.classList.remove("visible");
  } else {
    state.selectedPaperId = null;
  }
});

uploadTrigger.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    showToast("Only PDF files are supported.", "error");
    fileInput.value = "";
    return;
  }
  await uploadFile(file);
});

removeFileBtn.addEventListener("click", () => {
  state.uploadedPaperId  = null;
  state.uploadedFileName = null;
  fileBadge.classList.remove("visible");
  fileInput.value = "";
  paperSelect.value = "";
});

btnGenerate.addEventListener("click", handleGenerate);
btnExport.addEventListener("click", () => window.print());

/*Upload PDF to backend*/
async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  showToast("Uploading PDF…");
  btnGenerate.disabled = true;

  try {
    const res  = await fetch(`${API_BASE}/summary/upload`, {
      method: "POST",
      body:   formData,
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Upload failed.", "error");
      return;
    }

    state.uploadedPaperId  = data.paper_id;
    state.uploadedFileName = data.filename;
    state.selectedPaperId  = null;
    paperSelect.value      = "";

    // Show badge
    badgeFileName.textContent = data.filename;
    fileBadge.classList.add("visible");

    showToast("PDF uploaded successfully!", "success");

    // Add to dropdown for future use
    const opt = document.createElement("option");
    opt.value = data.paper_id;
    opt.textContent = data.title || data.filename;
    paperSelect.appendChild(opt);

  } catch {
    showToast("Could not connect to server.", "error");
  } finally {
    btnGenerate.disabled = false;
    fileInput.value = "";
  }
}

/*Generate summary*/
async function handleGenerate() {
  const paperId = state.uploadedPaperId || state.selectedPaperId;

  if (!paperId) {
    showToast("Please select or upload a paper first.", "error");
    return;
  }

  // Loading state
  btnGenerate.classList.add("loading");
  btnGenerate.disabled = true;
  summaryBox.classList.remove("visible");
  placeholder.style.display = "none";
  showToast("Generating summary, please wait…");

  try {
    const res  = await fetch(`${API_BASE}/summary/generate/${paperId}`, {
      method: "POST",
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Summarization failed.", "error");
      placeholder.style.display = "";
      return;
    }

    renderSummary(data);
    showToast("Summary generated!", "success");

  } catch {
    showToast("Could not connect to server.", "error");
    placeholder.style.display = "";
  } finally {
    btnGenerate.classList.remove("loading");
    btnGenerate.disabled = false;
  }
}

/*Render summary sections*/
function renderSummary(data) {
  summaryTitle.textContent = data.title || "Research Paper Summary";
  sectionsWrap.innerHTML   = "";

  (data.sections || []).forEach(sec => {
    const div = document.createElement("div");
    div.className = "summary-section";

    const title = document.createElement("p");
    title.className   = "section-title";
    title.textContent = sec.title;

    const content = document.createElement("div");
    content.className = "section-content";
    content.innerHTML = formatContent(sec.content);

    div.appendChild(title);
    div.appendChild(content);
    sectionsWrap.appendChild(div);

    // Divider between sections (except last)
    const hr = document.createElement("hr");
    hr.style.cssText = "border:none;border-top:1px solid #e0e8ff;margin:0";
    sectionsWrap.appendChild(hr);
  });

  // Remove last divider
  const hrs = sectionsWrap.querySelectorAll("hr");
  if (hrs.length) hrs[hrs.length - 1].remove();

  summaryBox.classList.add("visible");
  summaryBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* Convert Claude's bullet-style text to HTML */
function formatContent(text) {
  if (!text) return "<em>No content available.</em>";

  const lines = text.split("\n");
  let html    = "";
  let inList  = false;

  lines.forEach(line => {
    const trimmed = line.trim();
    const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.match(/^\*\s/);

    if (isBullet) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${escHtml(trimmed.replace(/^[-•*]\s+/, ""))}</li>`;
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      if (trimmed) html += `<p>${escHtml(trimmed)}</p>`;
    }
  });

  if (inList) html += "</ul>";
  return html;
}

/*Toast*/
let toastTimer;
function showToast(msg, type = "") {
  toast.textContent = msg;
  toast.className = "toast show" + (type ? ` ${type}` : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 3400);
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/*Boot*/
init();