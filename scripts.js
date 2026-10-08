/* ============================================================
   АКАДЕМИЯ ТОП — общие скрипты
   Подключается на каждой HTML-странице через <script src>
   Возможности:
     1) Переключение профиля (Общее / Дизайнеры / Разработчики)
     2) Поиск по сайдбару
     3) Копирование команд в буфер обмена
     4) Подсветка активной ссылки в сайдбаре при скролле
     5) Автоматическое раскрытие задач по ссылке
     6) Интерактивные графики на canvas (PLOT_RENDERERS)
     7) Сохранение состояния профиля в localStorage
   ============================================================ */

/* ------------------------------------------------------------
   1. ПРОФИЛЬ
   ------------------------------------------------------------ */
function setProfile(profile){
  if (!profile) return;
  document.body.className = 'profile-' + profile;

  document.querySelectorAll('.profile-switch button').forEach(b=>{
    b.classList.toggle('active', b.dataset.profile === profile);
  });

  // Сохраняем выбор
  try { localStorage.setItem('at-profile', profile); } catch(e){}

  // Обновляем ссылки сайдбара, если у них задан data-profile
  document.querySelectorAll('aside.sidebar a[data-profile]').forEach(a=>{
    const show = (profile === 'both' || a.dataset.profile === profile);
    a.style.display = show ? '' : 'none';
  });

  // Перерендерим MathJax (если есть)
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise().catch(()=>{});
  }
}
window.setProfile = setProfile;

/* ------------------------------------------------------------
   Инициализация после загрузки DOM
   ------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', ()=>{

  /* ---------- 1.1 Кнопки профиля ---------- */
  const sw = document.querySelector('.profile-switch');
  if (sw){
    sw.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', ()=> setProfile(btn.dataset.profile));
    });

    // Восстанавливаем сохранённый профиль
    try{
      const saved = localStorage.getItem('at-profile');
      const allowed = (document.body.dataset.profiles || 'both').split(/\s+/);
      if (saved && allowed.includes(saved)) {
        setProfile(saved);
      } else {
        const first = sw.querySelector('button.active') || sw.querySelector('button');
        if (first) setProfile(first.dataset.profile);
      }
    }catch(e){
      const first = sw.querySelector('button.active') || sw.querySelector('button');
      if (first) setProfile(first.dataset.profile);
    }
  }

  /* ---------- 2. Поиск по сайдбару ---------- */
  const search = document.querySelector('aside.sidebar .search');
  if (search){
    search.addEventListener('input', ()=>{
      const q = search.value.trim().toLowerCase();
      document.querySelectorAll('aside.sidebar a').forEach(a=>{
        if (q && !a.textContent.toLowerCase().includes(q)) {
          a.classList.add('hidden');
        } else {
          a.classList.remove('hidden');
        }
      });
    });
  }

  /* ---------- 3. Копирование команд ---------- */
  document.addEventListener('click', async (e)=>{
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    e.preventDefault();

    const cmd = btn.closest('.cmd');
    let text = btn.dataset.copy;
    if (!text && cmd){
      const pre = cmd.querySelector('pre');
      if (pre) text = pre.innerText;
    }
    if (!text) return;

    const original = btn.textContent;
    try{
      await navigator.clipboard.writeText(text);
      btn.classList.add('done');
      btn.textContent = '✓ Скопировано';
      setTimeout(()=>{
        btn.classList.remove('done');
        btn.textContent = original;
      }, 1400);
    }catch(err){
      // fallback для старых браузеров / http
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try{
        document.execCommand('copy');
        btn.classList.add('done');
        btn.textContent = '✓';
        setTimeout(()=>{ btn.classList.remove('done'); btn.textContent = original; }, 1200);
      }catch(e2){
        btn.textContent = '✗ Не удалось';
        setTimeout(()=>{ btn.textContent = original; }, 1400);
      }
      ta.remove();
    }
  });

  /* ---------- 4. Подсветка активной ссылки в сайдбаре ---------- */
  const sideLinks = [...document.querySelectorAll('aside.sidebar a[href^="#"]')];
  const targets = sideLinks
    .map(a => {
      const id = a.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      return el ? { link:a, el } : null;
    })
    .filter(Boolean);

  if (targets.length && 'IntersectionObserver' in window){
    const obs = new IntersectionObserver((entries)=>{
      entries.forEach(en=>{
        if (en.isIntersecting){
          sideLinks.forEach(l => l.classList.remove('active'));
          const t = targets.find(t => t.el === en.target);
          if (t) t.link.classList.add('active');
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });

    targets.forEach(t => obs.observe(t.el));
  }

  /* ---------- 5. Автоматическое раскрытие задачи по ссылке ---------- */
  document.querySelectorAll('a[data-open-task]').forEach(a=>{
    a.addEventListener('click', ()=>{
      const el = document.querySelector(a.dataset.openTask);
      if (el && el.tagName === 'DETAILS') el.open = true;
    });
  });

  /* ---------- 6. Инициализация графиков ---------- */
  document.querySelectorAll('[data-plot]').forEach(el => initPlot(el));
});

/* ============================================================
   ПЛОТТЕР — простой интерактивный рендерер графиков на canvas.
   Без внешних зависимостей.

   Разметка:
     <div class="plot-wrap" data-plot="tangent">
       <div class="controls">
         <label>Точка x₀:
           <input type="range" min="-2" max="2" step="0.1"
                  value="1" data-param="x0" name="x0">
           <span class="val" data-for="x0">1</span>
         </label>
       </div>
       <canvas class="plot" width="560" height="320"></canvas>
       <div class="cap">Описание</div>
     </div>

   Поддерживаемые типы (ключи в PLOT_RENDERERS):
     - parabola         : y = a·x² + b·x + c
     - tangent          : f(x)=x³-3x и касательная в точке x0
     - bisection        : метод половинного деления для x³-x-1
     - methods-compare  : сравнение дихотомии и Ньютона
     - interpolation    : многочлен Лагранжа через 5 точек
     - integral         : метод трапеций для 0.5·x²+1
     - euler            : метод Эйлера для y' = y - x
   ============================================================ */

const PLOT_STATE = {};

function initPlot(wrap){
  const kind = wrap.dataset.plot;
  const canvas = wrap.querySelector('canvas.plot');
  if (!canvas) return;

  const state = {
    canvas,
    wrap,
    params: {}
  };

  // Считываем range-инпуты и навешиваем обработчики
  wrap.querySelectorAll('input[type=range]').forEach(inp=>{
    const name = inp.dataset.param || inp.name;
    state.params[name] = parseFloat(inp.value);

    const out = wrap.querySelector(`[data-for="${name}"]`);
    if (out) out.textContent = inp.value;

    inp.addEventListener('input', ()=>{
      state.params[name] = parseFloat(inp.value);
      if (out) out.textContent = inp.value;
      renderPlot(kind, state);
    });
  });

  PLOT_STATE[kind] = state;
  renderPlot(kind, state);
}

function renderPlot(kind, state){
  const R = PLOT_RENDERERS[kind];
  if (R) R(state);
}

/* -------- Хелперы рисования -------- */

function setupCanvas(canvas){
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width || 560;
  const h = canvas.clientHeight || canvas.height || 320;

  if (canvas.width !== Math.round(w*dpr) || canvas.height !== Math.round(h*dpr)){
    canvas.width  = Math.round(w*dpr);
    canvas.height = Math.round(h*dpr);
  }
  canvas.style.height = h + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);

  return { ctx, w, h };
}

function drawAxes(ctx, w, h, xmin, xmax, ymin, ymax){
  const pad = 32;
  const mapX = x => pad + (x - xmin) / (xmax - xmin) * (w - 2*pad);
  const mapY = y => h - pad - (y - ymin) / (ymax - ymin) * (h - 2*pad);

  // Сетка
  ctx.strokeStyle = '#eef0f5';
  ctx.lineWidth = 1;
  const N = 10;
  for (let i = 0; i <= N; i++){
    const px = pad + i / N * (w - 2*pad);
    const py = pad + i / N * (h - 2*pad);
    ctx.beginPath(); ctx.moveTo(px, pad); ctx.lineTo(px, h-pad); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, py); ctx.lineTo(w-pad, py); ctx.stroke();
  }

  // Оси
  ctx.strokeStyle = '#8892a6';
  ctx.lineWidth = 1.4;
  const y0 = mapY(0);
  const x0 = mapX(0);
  if (y0 >= pad && y0 <= h-pad){
    ctx.beginPath(); ctx.moveTo(pad, y0); ctx.lineTo(w-pad, y0); ctx.stroke();
  }
  if (x0 >= pad && x0 <= w-pad){
    ctx.beginPath(); ctx.moveTo(x0, pad); ctx.lineTo(x0, h-pad); ctx.stroke();
  }

  return { mapX, mapY, pad };
}

function drawFunction(ctx, fn, mapX, mapY, xmin, xmax, opts){
  opts = opts || {};
  const N = 400;
  ctx.beginPath();
  ctx.strokeStyle = opts.color || '#4f46e5';
  ctx.lineWidth   = opts.width || 2.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  let started = false;
  for (let i = 0; i <= N; i++){
    const x = xmin + (xmax - xmin) * i / N;
    const y = fn(x);
    if (!isFinite(y)) { started = false; continue; }
    const px = mapX(x), py = mapY(y);
    if (!started){ ctx.moveTo(px, py); started = true; }
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function drawPoint(ctx, x, y, mapX, mapY, color, r){
  color = color || '#e11d48';
  r = r || 5;
  ctx.beginPath();
  ctx.arc(mapX(x), mapY(y), r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawLabel(ctx, text, x, y, color, size){
  ctx.fillStyle = color || '#1c2331';
  ctx.font = (size || 13) + 'px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(text, x, y);
}

/* -------- Рендереры конкретных графиков -------- */
const PLOT_RENDERERS = {

  /* f(x) = a·x² + b·x + c */
  parabola(state){
    const { ctx, w, h } = setupCanvas(state.canvas);
    const a = state.params.a != null ? state.params.a : 1;
    const b = state.params.b != null ? state.params.b : 0;
    const c = state.params.c != null ? state.params.c : 0;

    const { mapX, mapY } = drawAxes(ctx, w, h, -5, 5, -5, 5);
    drawFunction(ctx, x => a*x*x + b*x + c, mapX, mapY, -5, 5, { color:'#4f46e5' });

    if (a !== 0){
      const xv = -b / (2*a);
      if (xv >= -5 && xv <= 5){
        drawPoint(ctx, xv, a*xv*xv + b*xv + c, mapX, mapY, '#e11d48');
      }
    }
    drawLabel(ctx, `y = ${a}x² + ${b}x + ${c}`, 12, 20, '#4f46e5');
  },

  /* Касательная к f(x)=x³-3x */
  tangent(state){
    const { ctx, w, h } = setupCanvas(state.canvas);
    const x0 = state.params.x0 != null ? state.params.x0 : 1;

    const f  = x => x*x*x - 3*x;
    const df = x => 3*x*x - 3;

    const { mapX, mapY } = drawAxes(ctx, w, h, -3, 3, -6, 6);

    const y0 = f(x0), k = df(x0);
    drawFunction(ctx, x => y0 + k*(x - x0), mapX, mapY, -3, 3, {
      color:'#16a34a', width:1.8
    });

    drawFunction(ctx, f, mapX, mapY, -3, 3, { color:'#4f46e5' });

    drawPoint(ctx, x0, y0, mapX, mapY, '#e11d48');
    drawLabel(ctx, `x₀ = ${x0.toFixed(2)}`, 12, 20, '#e11d48');
    drawLabel(ctx, `f'(x₀) = ${k.toFixed(2)}`, 12, 38, '#16a34a');
  },

  /* Метод половинного деления для x³-x-1 */
  bisection(state){
    const { ctx, w, h } = setupCanvas(state.canvas);
    let a0 = state.params.a != null ? state.params.a : 0;
    let b0 = state.params.b != null ? state.params.b : 2;

    const f = x => x*x*x - x - 1;

    const pad0 = 0.5;
    const { mapX, mapY } = drawAxes(ctx, w, h, a0 - pad0, b0 + pad0, -3, 4);

    drawFunction(ctx, f, mapX, mapY, a0 - pad0, b0 + pad0, { color:'#4f46e5' });

    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 1;
    const iters = 6;
    for (let i = 0; i < iters; i++){
      const m = (a0 + b0) / 2;
      ctx.beginPath();
      ctx.moveTo(mapX(m), 40);
      ctx.lineTo(mapX(m), h - 32);
      ctx.stroke();
      if (f(a0) * f(m) < 0) b0 = m; else a0 = m;
    }
    ctx.restore();

    const root = (a0 + b0) / 2;
    drawPoint(ctx, root, 0, mapX, mapY, '#16a34a', 6);
    drawLabel(ctx, `x ≈ ${root.toFixed(4)}`, 12, 20, '#16a34a');
  },

  /* Сравнение методов решения уравнения (дихотомия vs Ньютон) */
  'methods-compare'(state){
    const { ctx, w, h } = setupCanvas(state.canvas);
    const f  = x => x*x*x - x - 1;
    const df = x => 3*x*x - 1;

    const { mapX, mapY } = drawAxes(ctx, w, h, 0.5, 2, -2, 3);

    // Функция
    drawFunction(ctx, f, mapX, mapY, 0.5, 2, { color:'#4f46e5' });

    // Дихотомия (5 итераций)
    let a = 1, b = 2;
    const bisPoints = [];
    for (let i = 0; i < 5; i++){
      const m = (a+b)/2;
      bisPoints.push(m);
      if (f(a)*f(m) < 0) b = m; else a = m;
    }
    bisPoints.forEach((x, i) => {
      drawPoint(ctx, x, 0, mapX, mapY, '#0891b2', 5 - i*0.6);
    });

    // Ньютон (5 итераций)
    let xn = 1.5;
    const newtonPoints = [];
    for (let i = 0; i < 5; i++){
      newtonPoints.push(xn);
      xn = xn - f(xn)/df(xn);
    }
    newtonPoints.forEach((x, i) => {
      drawPoint(ctx, x, 0, mapX, mapY, '#e11d48', 5 - i*0.6);
    });

    drawLabel(ctx, '● дихотомия (медленно, но надёжно)', 12, 20, '#0891b2');
    drawLabel(ctx, '● метод Ньютона (быстро)', 12, 38, '#e11d48');
    drawLabel(ctx, `Корень: x ≈ ${newtonPoints[4].toFixed(4)}`, 12, 56, '#16a34a');
  },

  /* Интерполяция: точки + многочлен Лагранжа */
  interpolation(state){
    const { ctx, w, h } = setupCanvas(state.canvas);
    const points = [[0,1],[1,2],[2,5],[3,10],[4,17]];

    const { mapX, mapY } = drawAxes(ctx, w, h, -0.5, 4.5, -1, 20);

    const lagrange = x => {
      let s = 0;
      for (let i = 0; i < points.length; i++){
        let p = points[i][1];
        for (let j = 0; j < points.length; j++){
          if (i !== j){
            p *= (x - points[j][0]) / (points[i][0] - points[j][0]);
          }
        }
        s += p;
      }
      return s;
    };

    drawFunction(ctx, lagrange, mapX, mapY, -0.5, 4.5, { color:'#4f46e5', width:2.4 });

    points.forEach(([x, y]) => {
      drawPoint(ctx, x, y, mapX, mapY, '#e11d48', 6);
    });

    drawLabel(ctx, '● узлы интерполяции', 12, 20, '#e11d48');
    drawLabel(ctx, '— многочлен Лагранжа', 12, 38, '#4f46e5');
  },

  /* Метод трапеций для f(x) = 0.5·x² + 1 на [0,3] */
  integral(state){
    const { ctx, w, h } = setupCanvas(state.canvas);
    const n = Math.max(1, Math.round(state.params.n != null ? state.params.n : 6));

    const f = x => 0.5*x*x + 1;
    const a = 0, b = 3;
    const dx = (b - a) / n;

    const { mapX, mapY } = drawAxes(ctx, w, h, -0.5, 3.5, -0.5, 5);

    // Трапеции
    ctx.fillStyle   = 'rgba(79,70,229,0.12)';
    ctx.strokeStyle = 'rgba(79,70,229,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++){
      const x1 = a + i*dx;
      const x2 = x1 + dx;
      ctx.beginPath();
      ctx.moveTo(mapX(x1), mapY(0));
      ctx.lineTo(mapX(x1), mapY(f(x1)));
      ctx.lineTo(mapX(x2), mapY(f(x2)));
      ctx.lineTo(mapX(x2), mapY(0));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Кривая
    drawFunction(ctx, f, mapX, mapY, -0.5, 3.5, { color:'#e11d48' });

    // Оценка
    let s = 0;
    for (let i = 0; i < n; i++){
      const x1 = a + i*dx;
      const x2 = x1 + dx;
      s += (f(x1) + f(x2)) / 2 * dx;
    }

    drawLabel(ctx, `n = ${n},  S ≈ ${s.toFixed(3)}`, 12, 20, '#e11d48');
    drawLabel(ctx, 'точное: 7.5', 12, 38, '#16a34a');
  },

  /* Метод Эйлера для y' = y - x */
  euler(state){
    const { ctx, w, h } = setupCanvas(state.canvas);
    const steps = Math.max(2, Math.round(state.params.steps != null ? state.params.steps : 10));

    const f = (x, y) => y - x;
    const x0 = 0, y0 = 1, xmax = 3;
    const dx = (xmax - x0) / steps;

    const exact = x => x + 1;

    const { mapX, mapY } = drawAxes(ctx, w, h, -0.2, 3.2, 0, 4.2);

    // Точное решение
    drawFunction(ctx, exact, mapX, mapY, -0.2, 3.2, { color:'#16a34a', width:1.5 });

    // Численное
    let x = x0, y = y0;
    const pts = [[x, y]];
    for (let i = 0; i < steps; i++){
      y = y + dx * f(x, y);
      x = x + dx;
      pts.push([x, y]);
    }

    ctx.beginPath();
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    pts.forEach(([px, py], i)=>{
      const X = mapX(px), Y = mapY(py);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    });
    ctx.stroke();

    pts.forEach(([px, py])=> drawPoint(ctx, px, py, mapX, mapY, '#4f46e5', 3));

    drawLabel(ctx, `шагов: ${steps}`, 12, 20, '#4f46e5');
    drawLabel(ctx, 'точное решение', 12, 38, '#16a34a');
  }

};

/* ============================================================
   Перерисовка графиков при resize окна
   ============================================================ */
let resizeTimer = null;
window.addEventListener('resize', ()=>{
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(()=>{
    Object.keys(PLOT_STATE).forEach(kind=>{
      renderPlot(kind, PLOT_STATE[kind]);
    });
  }, 200);
});