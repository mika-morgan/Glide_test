// --- CodeMirror setup ---
const editor = CodeMirror(document.getElementById('editor'), {
  value:
`#Welcome to Glide, an online Python IDE
#Try snippets from the left or type your own code, then click 'Run'

print("Hello, world!")
`,
  mode: "python",
  theme: "neo",
  lineNumbers: true,
  indentUnit: 4,
  tabSize: 4,
  indentWithTabs: false,
  autofocus: true,
});

const runBtn = document.getElementById('runBtn');
const clearBtn = document.getElementById('clearBtn');
const downloadBtn = document.getElementById('downloadBtn');
const outputEl = document.getElementById('output');
const runtimeStatus = document.getElementById('runtimeStatus');
const editorStatus = document.getElementById('editorStatus');

let pyodide = null;
let pyReady = false;

function appendOutput(text) {
  if (text == null) return;
  const s = String(text).replace(/\r\n/g, "\n");
  const needsNL = s.length && !s.endsWith("\n");
  outputEl.textContent += needsNL ? s + "\n" : s;
  outputEl.scrollTop = outputEl.scrollHeight;
}

function setOutput(text) {
  outputEl.textContent = text || "";
}

// --- Load Pyodide ---
(async () => {
  runtimeStatus.textContent = "Loading Python runtime…";
  try {
    pyodide = await loadPyodide({
      stdout: (t) => appendOutput(t + "\n"),
      stderr: (t) => appendOutput(t + "\n"),
    });

    // input() -> JS prompt
    await pyodide.runPythonAsync(`
    import builtins, js
    def _glide_input(prompt=''):
        v = js.window.prompt(str(prompt), "")
        if v is None:
            raise KeyboardInterrupt("Input cancelled")
        return str(v)
    builtins.input = _glide_input
    del _glide_input
        `);

    pyReady = true;
    runtimeStatus.textContent = "Python ready";
  } catch (e) {
    runtimeStatus.textContent = "Failed to load Python";
    appendOutput("Error loading Pyodide:\n" + (e && e.message ? e.message : e));
  }
})();

// --- Run/Clear ---
runBtn.addEventListener('click', async () => {
  if (!pyReady) {
    appendOutput("Runtime not ready yet.\n");
    return;
  }
  runBtn.disabled = true;
  editorStatus.textContent = "Running…";
  try {
    const code = editor.getValue();
    await pyodide.runPythonAsync(`import sys, traceback`);
    await pyodide.runPythonAsync(code);
    editorStatus.textContent = "Done";
    updateVariables();

  } catch (e) {
    appendOutput((e && e.message ? e.message : String(e)) + "\n");
    editorStatus.textContent = "Error";
  } finally {
    runBtn.disabled = false;
  }
});

clearBtn.addEventListener('click', () => setOutput(""));

// --- Download Code ---
if (downloadBtn) {
  downloadBtn.addEventListener('click', () => {
    let code = editor.getValue();
    const footer = '\n\n# Written using GLIDE\n';
    if (!code.endsWith('\n') && code.length) code += '\n';
    if (!code.includes('# Written using GLIDE')) code += footer;

    const suggested = 'glide_code.py';
    const name = (prompt('File name for download:', suggested) || suggested).trim();
    const filename = name.toLowerCase().endsWith('.py') ? name : `${name}.py`;

    const blob = new Blob([code], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  });
}

// --- Persist toolbox open/closed state ---
(function persistToolbox() {
  const KEY = "glide.toolbox.state.v1";
  let state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}

  document.querySelectorAll(".toolbox .section").forEach(sec => {
    const k = sec.getAttribute("data-key");
    if (k && typeof state[k] === "boolean") sec.open = state[k];
    sec.addEventListener("toggle", () => {
      state[k] = sec.open;
      localStorage.setItem(KEY, JSON.stringify(state));
    });
  });
})();

// --- Toolbox insertion ---
function insertSnippet(snippet) {
  const doc = editor.getDoc();
  const cursor = doc.getCursor();
  const lineText = doc.getLine(cursor.line);
  const needsLeadingNL = lineText.slice(0, cursor.ch).trim().length > 0 ? "\n" : "";
  doc.replaceRange(needsLeadingNL + snippet, cursor);

  const endPos = doc.getCursor();
  editor.focus();

  const insertedLines = snippet.split("\n").length - 1;
  const startLine = endPos.line - insertedLines;
  for (let i = startLine; i <= endPos.line; i++) {
    editor.indentLine(i, "smart");
  }
}

function updateVariables() {
  if (!pyReady) return;
  try {
    // Get global variables as a dictionary
    const vars = pyodide.runPython(`
      import builtins
      {k: repr(v) for k, v in globals().items()
       if not k.startswith("__") and k not in dir(builtins)}
    `);

    const varsEl = document.getElementById("variables");
    varsEl.textContent = "";

    if (Object.keys(vars).length === 0) {
      varsEl.textContent = "(no variables)";
    } else {
      for (const [k, v] of Object.entries(vars)) {
        varsEl.textContent += `${k} = ${v}\n`;
      }
    }
  } catch (e) {
    console.error("Error updating variables:", e);
  }
}

document.getElementById("stepBtn").addEventListener("click", () => {
  console.log("Step clicked");
});

document.getElementById("runToEndBtn").addEventListener("click", () => {
  console.log("Run to End clicked");
});

document.getElementById("stopBtn").addEventListener("click", () => {
  console.log("Stop clicked");
});


document.querySelectorAll(".snip").forEach(btn => {
  btn.addEventListener("click", () => {
    const raw = btn.getAttribute("data-snippet") || "";
    const snippet = raw.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    insertSnippet(snippet);
  });
});
