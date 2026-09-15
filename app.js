/* ============================================================
   Água na Conta — app.js
   ============================================================ */
"use strict";

// ── CONSTANTS ──────────────────────────────────────────────
const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MAX_PREV_MONTHS = 5;
// OMS/CAESB benchmark: 100-200 L/pessoa/dia → ~3-6 m³/pessoa/mês
const PERCAPITA_OK   = 3.5;  // m³/pessoa/mês
const PERCAPITA_WARN = 6;
const ALL_TIPS = [
  {
    icon:"🚿", title:"Banhos mais curtos",
    desc:"Reduzir o banho de 15 para 5 minutos economiza até 90 litros por banho. Prefira chuveiros de baixo fluxo.",
    saving:"Economia: até 2 700 L/mês por pessoa"
  },
  {
    icon:"🚰", title:"Feche a torneira ao escovar os dentes",
    desc:"Deixar a torneira aberta gasta até 12 litros por minuto. Com bocais econômicos você reduz ainda mais.",
    saving:"Economia: até 720 L/mês"
  },
  {
    icon:"🔧", title:"Conserte vazamentos",
    desc:"Uma torneira pingando pode desperdiçar até 46 litros por dia. Verifique caixas d'água, registros e tubulações.",
    saving:"Economia: até 1 380 L/mês"
  },
  {
    icon:"🌿", title:"Reutilize água da máquina de lavar",
    desc:"Use a água do enxágue para limpar quintais, calçadas ou vasos sanitários — com um simples balde.",
    saving:"Economia: até 1 000 L/mês"
  },
  {
    icon:"🪣", title:"Colete água da chuva",
    desc:"Instale uma calha de coleta para irrigar plantas, lavar áreas externas e abastecer descargas.",
    saving:"Economia: até 2 000 L/mês (época chuvosa)"
  },
  {
    icon:"🫙", title:"Reutilize água do cozimento",
    desc:"A água usada para cozinhar massas e legumes pode irrigar plantas após esfriar.",
    saving:"Economia: até 200 L/mês"
  },
  {
    icon:"🍽️", title:"Lave louça com eficiência",
    desc:"Em vez de deixar água correndo, ensaboe tudo e enxágue de uma só vez. Se tiver lava-louças, espere a carga completa.",
    saving:"Economia: até 1 000 L/mês"
  },
  {
    icon:"🌱", title:"Regue plantas no horário certo",
    desc:"Regue ao amanhecer ou no final da tarde para evitar evaporação. Use rega localizada em vez de aspersão.",
    saving:"Economia: até 800 L/mês"
  }
];

// ── STATE ──────────────────────────────────────────────────
let chartInstance = null;
let currentData   = null;
let monthCount    = 0;

// ── DOM REFS ──────────────────────────────────────────────
const form             = document.getElementById("waterForm");
const prevContainer    = document.getElementById("prevMonthsContainer");
const addMonthBtn      = document.getElementById("addMonthBtn");
const resultSection    = document.getElementById("resultados");
const formSection      = document.getElementById("formulario");
const overviewCards    = document.getElementById("overviewCards");
const trendAlert       = document.getElementById("trendAlert");
const chartSection     = document.getElementById("chartSection");
const percapitaSection = document.getElementById("percapitaSection");
const tipsList         = document.getElementById("tipsList");
const simSlider        = document.getElementById("simSlider");
const simPctLabel      = document.getElementById("simPctLabel");
const simResults       = document.getElementById("simResults");
const simInsight       = document.getElementById("simInsight");
const editBtn          = document.getElementById("editBtn");
const shareBtn         = document.getElementById("shareBtn");
const printBtn         = document.getElementById("printBtn");
const resetBtn         = document.getElementById("resetBtn");

// ── HELPERS ───────────────────────────────────────────────
const fmt  = (n, d=2)  => n.toLocaleString("pt-BR", {minimumFractionDigits:d, maximumFractionDigits:d});
const fmtR = (n)        => "R$ " + fmt(n);
const pct  = (a, b)    => b === 0 ? 0 : ((a - b) / b * 100);
const clamp = (v,a,b)  => Math.min(b, Math.max(a, v));
const qs   = s          => document.querySelector(s);

function monthLabel(offsetFromNow) {
  const d = new Date();
  d.setMonth(d.getMonth() - offsetFromNow);
  return MONTHS_PT[d.getMonth()] + "/" + String(d.getFullYear()).slice(2);
}

// ── PREVIOUS MONTHS LOGIC ─────────────────────────────────
function addMonth() {
  if (monthCount >= MAX_PREV_MONTHS) return;
  monthCount++;
  const idx   = monthCount;
  const label = monthLabel(idx);
  const div   = document.createElement("div");
  div.className = "month-entry";
  div.dataset.idx = idx;
  div.innerHTML = `
    <label>${label} (m³)</label>
    <div class="month-entry-row">
      <input type="number" name="prev_${idx}" min="0" step="0.1"
             placeholder="Ex: ${(15 + Math.random()*8).toFixed(1)}"
             aria-label="Consumo de ${label}" />
      <button type="button" class="month-remove" aria-label="Remover ${label}" title="Remover">✕</button>
    </div>`;
  div.querySelector(".month-remove").addEventListener("click", () => {
    div.remove();
    monthCount--;
    if (monthCount < MAX_PREV_MONTHS) addMonthBtn.disabled = false;
    reindexMonths();
  });
  prevContainer.appendChild(div);
  if (monthCount >= MAX_PREV_MONTHS) addMonthBtn.disabled = true;
}

function reindexMonths() {
  const entries = prevContainer.querySelectorAll(".month-entry");
  entries.forEach((el, i) => {
    const offset = i + 1;
    const label  = monthLabel(offset);
    el.dataset.idx = offset;
    el.querySelector("label").textContent = `${label} (m³)`;
    const inp = el.querySelector("input");
    inp.name = `prev_${offset}`;
    inp.setAttribute("aria-label", `Consumo de ${label}`);
  });
  monthCount = entries.length;
  addMonthBtn.disabled = monthCount >= MAX_PREV_MONTHS;
}

function getPrevValues() {
  const values = [];
  prevContainer.querySelectorAll(".month-entry").forEach(el => {
    const v = parseFloat(el.querySelector("input").value);
    if (!isNaN(v) && v >= 0) values.push(v);
  });
  return values;
}

// ── FORM VALIDATION ───────────────────────────────────────
function validateForm(valor, consumo, pessoas) {
  let ok = true;
  [["valorConta", valor], ["consumoAtual", consumo], ["numPessoas", pessoas]].forEach(([id, v]) => {
    const el  = document.getElementById(id);
    const wrap = el.closest(".input-wrap");
    const old  = el.parentNode.parentNode.querySelector(".error-msg");
    if (old) old.remove();
    if (isNaN(v) || v <= 0) {
      ok = false;
      wrap.style.borderColor = "var(--red-500)";
      const err = document.createElement("span");
      err.className = "error-msg";
      err.textContent = "Valor inválido";
      el.closest(".field-group").appendChild(err);
    } else {
      wrap.style.borderColor = "";
    }
  });
  return ok;
}

// ── ANALYSIS ENGINE ───────────────────────────────────────
function analyze(valor, consumo, pessoas, prev) {
  const prevMonth = prev.length > 0 ? prev[0] : null;
  const variation = prevMonth !== null ? pct(consumo, prevMonth) : null;
  const percapita = consumo / pessoas;               // m³/pessoa/mês
  const percapitaL = percapita * 1000 / 30;          // L/pessoa/dia
  const precoM3   = valor / consumo;                 // R$/m³
  const allValues = [consumo, ...prev];
  const avg       = allValues.reduce((a,b) => a+b, 0) / allValues.length;

  return { valor, consumo, pessoas, prev, prevMonth, variation,
           percapita, percapitaL, precoM3, avg, allValues };
}

// ── RENDER OVERVIEW CARDS ─────────────────────────────────
function renderOverview(d) {
  const varStr = d.variation !== null
    ? (d.variation >= 0 ? `▲ +${fmt(d.variation, 1)}%` : `▼ ${fmt(d.variation, 1)}%`)
    : "—";
  const varColor = d.variation === null ? "card-blue"
    : d.variation > 15 ? "card-red"
    : d.variation < -5  ? "card-green"
    : "card-yellow";

  const cards = [
    { cls:"card-blue",  icon:"💰", label:"Valor da conta",    value: fmtR(d.valor),                 sub:"fatura atual" },
    { cls:"card-cyan",  icon:"💧", label:"Consumo atual",     value: fmt(d.consumo,1) + " m³",       sub:"este mês" },
    { cls:"card-blue",  icon:"👨‍👩‍👧", label:"Pessoas",          value: d.pessoas,                     sub:"na residência" },
    { cls:varColor,     icon:"📊", label:"Variação mensal",   value: varStr,                         sub: d.prevMonth !== null ? `vs ${fmt(d.prevMonth,1)} m³` : "sem histórico" },
    { cls:"card-blue",  icon:"💵", label:"Custo por m³",      value: fmtR(d.precoM3),               sub:"preço unitário" },
    { cls:"card-cyan",  icon:"🚿", label:"Por pessoa/dia",    value: fmt(d.percapitaL, 0) + " L",   sub:"consumo per capita" },
  ];

  overviewCards.innerHTML = cards.map(c => `
    <div class="ov-card ${c.cls}">
      <span class="ov-icon">${c.icon}</span>
      <span class="ov-label">${c.label}</span>
      <span class="ov-value">${c.value}</span>
      <span class="ov-sub">${c.sub}</span>
    </div>`).join("");
}

// ── RENDER TREND ALERT ────────────────────────────────────
function renderTrend(d) {
  if (d.variation === null && d.percapitaL <= PERCAPITA_WARN * 1000 / 30) {
    trendAlert.classList.add("hidden");
    return;
  }
  trendAlert.classList.remove("hidden");

  let cls, icon, title, body;

  if (d.variation !== null && d.variation > 30) {
    cls  = "alert-warn";
    icon = "⚠️";
    title= `Consumo aumentou ${fmt(d.variation,1)}% em relação ao mês anterior!`;
    body = `Isso pode indicar vazamento oculto, uso excessivo ou mais pessoas na residência.
            Verifique caixas d'água, canos e registros. Um simples teste: feche todos os pontos de água
            e observe o hidrômetro por 30 minutos — se ele se mover, há vazamento.`;
  } else if (d.variation !== null && d.variation > 10) {
    cls  = "alert-up";
    icon = "📈";
    title= `Consumo subiu ${fmt(d.variation,1)}% em relação ao mês anterior`;
    body = "Uma alta moderada. Tente identificar hábitos novos: mais banhos, irrigação, visitas, etc.";
  } else if (d.variation !== null && d.variation < -10) {
    cls  = "alert-down";
    icon = "✅";
    title= `Ótimo! Você reduziu o consumo em ${fmt(Math.abs(d.variation),1)}%`;
    body = "Continue assim! Pequenas mudanças de hábito fazem grande diferença na conta e no meio ambiente.";
  } else if (d.percapitaL > PERCAPITA_WARN * 1000 / 30) {
    cls  = "alert-up";
    icon = "💧";
    title= "Consumo per capita acima do recomendado";
    body = `Cada pessoa está usando cerca de ${fmt(d.percapitaL, 0)} L/dia. A OMS recomenda no máximo 110 L/dia para uso doméstico sustentável.`;
  } else {
    cls  = "alert-stable";
    icon = "📌";
    title= "Consumo estável";
    body = "Seu consumo está próximo do mês anterior. Continue monitorando!";
  }

  trendAlert.className = `trend-alert ${cls}`;
  trendAlert.innerHTML = `
    <span class="alert-icon">${icon}</span>
    <div class="alert-body"><strong>${title}</strong>${body}</div>`;
}

// ── RENDER CHART ──────────────────────────────────────────
function renderChart(d) {
  if (d.allValues.length < 2) { chartSection.classList.add("hidden"); return; }
  chartSection.classList.remove("hidden");

  const labels = d.allValues.map((_, i) => i === 0 ? "Atual" : monthLabel(i));
  labels.reverse();
  const values = [...d.allValues].reverse();

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  const ctx = document.getElementById("consumoChart").getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 280);
  gradient.addColorStop(0, "rgba(37,128,212,.35)");
  gradient.addColorStop(1, "rgba(37,128,212,.02)");

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Consumo (m³)",
        data: values,
        borderColor: "#2580d4",
        backgroundColor: gradient,
        pointBackgroundColor: "#2580d4",
        pointRadius: 6,
        pointHoverRadius: 9,
        tension: 0.38,
        fill: true,
        borderWidth: 3,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${fmt(ctx.parsed.y, 1)} m³`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: false,
          title: { display: true, text: "m³" },
          ticks: { callback: v => fmt(v,0) + " m³" }
        }
      }
    }
  });
}

// ── RENDER PER CAPITA ─────────────────────────────────────
function renderPercapita(d) {
  const pct_bench = clamp(d.percapitaL / (PERCAPITA_WARN * 1000 / 30) * 100, 0, 100);
  const fillCls = d.percapitaL < PERCAPITA_OK * 1000 / 30 ? "ok"
                : d.percapitaL < PERCAPITA_WARN * 1000 / 30 ? "warn"
                : "high";
  const comment = fillCls === "ok"   ? "✅ Excelente! Abaixo da média recomendada."
                : fillCls === "warn" ? "⚠️ Atenção: consumo moderado. Pequenas mudanças ajudam."
                : "🚨 Alto! Acima do recomendado pela OMS. Veja as dicas abaixo.";

  percapitaSection.innerHTML = `
    <h3 class="section-label">👥 Análise por pessoa</h3>
    <div class="percapita-grid">
      <div class="pc-item">
        <div class="pc-value">${fmt(d.percapita, 2)} m³</div>
        <div class="pc-label">por pessoa / mês</div>
      </div>
      <div class="pc-item">
        <div class="pc-value">${fmt(d.percapitaL, 0)} L</div>
        <div class="pc-label">por pessoa / dia</div>
      </div>
      <div class="pc-item">
        <div class="pc-value">${fmtR(d.valor / d.pessoas)}</div>
        <div class="pc-label">custo por pessoa / mês</div>
      </div>
    </div>
    <div class="benchmark-bar" style="margin-top:20px">
      <div class="bench-label">Comparativo OMS (ideal: até ${fmt(PERCAPITA_OK * 1000/30, 0)} L/dia — limite: ${fmt(PERCAPITA_WARN*1000/30,0)} L/dia)</div>
      <div class="bench-track">
        <div class="bench-fill ${fillCls}" style="width:${pct_bench}%"></div>
      </div>
      <div class="bench-markers"><span>0 L</span><span>110 L</span><span>200 L</span></div>
      <p style="margin-top:10px;font-size:.85rem;color:var(--gray-700)">${comment}</p>
    </div>`;
}

// ── RENDER TIPS ───────────────────────────────────────────
function renderTips(d) {
  // pick 5 most relevant tips
  let pool = [...ALL_TIPS];
  if (d.percapitaL > 100) {
    pool = [ALL_TIPS[0], ALL_TIPS[2], ALL_TIPS[4], ALL_TIPS[6], ALL_TIPS[3]];
  } else if (d.variation > 20) {
    pool = [ALL_TIPS[2], ALL_TIPS[0], ALL_TIPS[3], ALL_TIPS[1], ALL_TIPS[6]];
  } else {
    pool = pool.slice(0, 5);
  }
  tipsList.innerHTML = pool.map(t => `
    <div class="tip-card">
      <span class="tip-icon">${t.icon}</span>
      <div class="tip-body">
        <div class="tip-title">${t.title}</div>
        <div class="tip-desc">${t.desc}</div>
        <span class="tip-saving">💚 ${t.saving}</span>
      </div>
    </div>`).join("");
}

// ── SIMULATOR ─────────────────────────────────────────────
function renderSimulator(d) {
  const pctVal   = parseInt(simSlider.value);
  simPctLabel.textContent = pctVal + "%";

  const newConsumo = d.consumo * (1 - pctVal / 100);
  const newValor   = newConsumo * d.precoM3;
  const econM3     = d.consumo - newConsumo;
  const econR$     = d.valor - newValor;
  const econYear   = econR$ * 12;
  const econLday   = econM3 * 1000 / 30;

  simResults.innerHTML = `
    <div class="sim-card">
      <div class="sim-card-value">${fmt(newConsumo, 1)} m³</div>
      <div class="sim-card-label">Novo consumo / mês</div>
    </div>
    <div class="sim-card">
      <div class="sim-card-value">${fmtR(newValor)}</div>
      <div class="sim-card-label">Nova fatura / mês</div>
    </div>
    <div class="sim-card">
      <div class="sim-card-value">${fmtR(econR$)}</div>
      <div class="sim-card-label">Economia / mês</div>
    </div>
    <div class="sim-card">
      <div class="sim-card-value">${fmtR(econYear)}</div>
      <div class="sim-card-label">Economia / ano</div>
    </div>`;

  const insights = [
    `💧 Você deixaria de desperdiçar <strong>${fmt(econLday, 0)} litros por dia</strong> — o equivalente a ${Math.round(econLday / 15)} banhos de 15 minutos!`,
    `🌍 Em um ano, você preservaria <strong>${fmt(econM3 * 12, 1)} m³ de água</strong> — o suficiente para abastecer ${Math.round(econM3 * 12 / 0.15)} pessoas por um dia.`,
    `💰 Com ${fmtR(econYear)} economizados, você poderia comprar ${Math.round(econYear / 5)} pãezinhos ou cobrir ${Math.floor(econYear / (d.valor / 12))} meses de conta de água!`
  ];
  simInsight.innerHTML = insights[Math.floor(Math.random() * insights.length)];
}

// ── MAIN RENDER ───────────────────────────────────────────
function renderResults() {
  const valor   = parseFloat(document.getElementById("valorConta").value);
  const consumo = parseFloat(document.getElementById("consumoAtual").value);
  const pessoas = parseInt(document.getElementById("numPessoas").value);
  const prev    = getPrevValues();

  if (!validateForm(valor, consumo, pessoas)) return;

  currentData = analyze(valor, consumo, pessoas, prev);

  renderOverview(currentData);
  renderTrend(currentData);
  renderChart(currentData);
  renderPercapita(currentData);
  renderTips(currentData);
  renderSimulator(currentData);

  resultSection.classList.remove("hidden");
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── EVENTS ────────────────────────────────────────────────
form.addEventListener("submit", e => { e.preventDefault(); renderResults(); });
addMonthBtn.addEventListener("click", addMonth);
resetBtn.addEventListener("click", () => {
  prevContainer.innerHTML = "";
  monthCount = 0;
  addMonthBtn.disabled = false;
  resultSection.classList.add("hidden");
  document.getElementById("valorConta").value  = "";
  document.getElementById("consumoAtual").value = "";
  document.getElementById("numPessoas").value  = "";
});
editBtn.addEventListener("click", () => {
  resultSection.classList.add("hidden");
  formSection.scrollIntoView({ behavior: "smooth" });
});

simSlider.addEventListener("input", () => {
  if (currentData) renderSimulator(currentData);
});

shareBtn.addEventListener("click", () => {
  if (navigator.share) {
    navigator.share({
      title: "💧 Água na Conta — Análise Hídrica",
      text:  "Analisei minha conta de água e aprendi como economizar! Tente você também.",
      url:   window.location.href
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(window.location.href).then(() => {
      shareBtn.textContent = "✅ Link copiado!";
      setTimeout(() => { shareBtn.innerHTML = "Compartilhar 💧"; }, 2000);
    });
  }
});

printBtn.addEventListener("click", () => window.print());

// ── INIT: pre-add 1 month slot ────────────────────────────
addMonth();
