// ── Supabase 클라이언트 (auth.js에서 SUPABASE_URL, SUPABASE_ANON_KEY, getAuthHeaders 제공) ──
const sb = {
  async get(table, filter = '') {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?order=created_at.asc${filter}`, { headers });
    return res.ok ? res.json() : [];
  },
  async insert(table, data) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ ...data, user_id: currentUser?.id })
    });
    return res.ok ? res.json() : null;
  },
  async update(table, id, data) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(data)
    });
    return res.ok ? res.json() : null;
  },
  async delete(table, id) {
    const headers = await getAuthHeaders();
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'DELETE',
      headers
    });
  }
};

// ── 종목 코드 매핑 ────────────────────────────────────────────
const SYMBOL_MAP = {
  '대한항공': '003490', '삼성SDI': '006400', '에코프로머티': '450080',
  '루닛': '328130', 'POSCO홀딩스': '005490', '삼성전자': '005930',
  'SK하이닉스': '000660', '카카오': '035720', '네이버': '035420',
  '현대차': '005380', '우진엔텍': '018620',
};

async function fetchIndices() {
  const indices = [
    { key: 'kospi',  symbol: '^KS11',   label: 'KOSPI' },
    { key: 'kosdaq', symbol: '^KQ11',   label: 'KOSDAQ' },
    { key: 'sp500',  symbol: '^GSPC',   label: 'S&P 500' },
    { key: 'dji',    symbol: '^DJI',    label: '다우존스' },
    { key: 'ixic',   symbol: '^IXIC',   label: '나스닥' },
    { key: 'krw',    symbol: 'KRW=X',   label: '원/달러' },
    { key: 'wti',    symbol: 'CL=F',    label: '유가 WTI' },
    { key: 'gold',   symbol: 'GC=F',    label: '금' },
    { key: 'btc',    symbol: 'BTC-USD', label: '비트코인' },
  ];
  const results = {};
  await Promise.all(indices.map(async (idx) => {
    try {
      const res = await fetch(`/api/price?symbol=${encodeURIComponent(idx.symbol)}&type=index`);
      if (!res.ok) return;
      const data = await res.json();
      results[idx.key] = { price: data.price, change: data.change, label: idx.label };
    } catch { }
  }));
  return results;
}

async function fetchPrice(name) {
  const symbol = SYMBOL_MAP[name];
  if (!symbol) return null;
  try {
    const res = await fetch(`/api/price?symbol=${symbol}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.price || null;
  } catch { return null; }
}

async function refreshAllPrices() {
  const positions = await sb.get('positions', '&status=eq.open');
  if (positions.length === 0) return;
  const btn = document.getElementById('refresh-btn');
  btn.textContent = '갱신 중...'; btn.disabled = true;

  let updated = 0, noCode = 0;
  for (const p of positions) {
    // DB에 저장된 code 직접 사용 (SYMBOL_MAP 우선, DB code 보완)
    const code = p.code || SYMBOL_MAP[p.name];
    if (!code) { noCode++; continue; }
    try {
      const res = await fetch(`/api/price?symbol=${code}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.price) {
        await sb.update('positions', p.id, { current_price: data.price });
        updated++;
      }
    } catch { continue; }
  }

  if (updated > 0 && noCode > 0) {
    btn.textContent = `✓ ${updated}개 갱신 · ${noCode}개 코드 없음`;
  } else if (updated > 0) {
    btn.textContent = `✓ ${updated}개 갱신 완료`;
  } else {
    btn.textContent = '코드 없는 종목 확인 필요';
  }
  btn.disabled = false;
  setTimeout(() => { const b = document.getElementById('refresh-btn'); if (b) b.textContent = '현재가 갱신'; }, 3000);
  if (updated > 0) renderPortfolio();
}

// ── 유틸 ──────────────────────────────────────────────────────
function fmtNum(n) { if (n === null || n === undefined || n === '') return '—'; return Math.round(n).toLocaleString('ko-KR'); }
function fmtPct(n) { return (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'; }
function calcPnlPct(entry, current) { return ((current - entry) / entry) * 100; }
function calcPnlAmt(entry, current, qty) { return (current - entry) * qty; }
function pnlClass(n) { return n >= 0 ? 'pos' : 'neg'; }
function todayStr() { const d = new Date(); return d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0'); }

// ── 탭 전환 ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      // 탭 버튼이 보이도록 스크롤
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      if (btn.dataset.tab === 'entry') renderEntryForm();
      if (btn.dataset.tab === 'review') renderReview();
      if (btn.dataset.tab === 'watchlist') renderWatchlist();
      if (btn.dataset.tab === 'stats') renderStats();
      if (btn.dataset.tab === 'diary') renderDiary();
    });
  });
});

// ── 보유 포지션 ───────────────────────────────────────────────

// ── 승률 링 차트 ───────────────────────────────────────────────
function drawWinRateRing(wins, losses) {
  const canvas = document.getElementById('win-rate-ring');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const S = 80;
  canvas.width = S * dpr; canvas.height = S * dpr;
  canvas.style.width = S + 'px'; canvas.style.height = S + 'px';
  ctx.scale(dpr, dpr);
  const cx = 40, cy = 40, R = 32, lw = 8;
  const total = wins + losses;
  const rate = total > 0 ? wins / total : 0;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(240,96,96,0.18)'; ctx.lineWidth = lw; ctx.stroke();
  if (rate > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + rate * Math.PI * 2);
    ctx.strokeStyle = '#4caf7d'; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
  }
  ctx.fillStyle = '#5a5a72';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold ' + (8.5 * dpr) + 'px -apple-system,sans-serif';
  ctx.scale(1 / dpr, 1 / dpr);
  ctx.fillText('승률', cx * dpr, (cy - 8) * dpr);
  ctx.fillStyle = '#e8e8f0';
  ctx.font = 'bold ' + (15 * dpr) + 'px -apple-system,sans-serif';
  ctx.fillText(total > 0 ? Math.round(rate * 100) + '%' : '—', cx * dpr, (cy + 8) * dpr);
}

// ── 종목 비중 도넛 차트 ────────────────────────────────────────
function drawDonutChart(positions) {
  const el = document.getElementById('donut-chart');
  if (!el || positions.length === 0) return;
  const total = positions.reduce((s, p) => s + p.current_price * p.qty, 0);
  if (!total) return;
  const COLORS = ['#7b68ee','#4caf7d','#5090e0','#f0a030','#f06060','#e06be0','#60c0d0'];
  const sorted = [...positions].sort((a, b) => (b.current_price * b.qty) - (a.current_price * a.qty));
  el.innerHTML = sorted.map((p, i) => {
    const pct = (p.current_price * p.qty / total * 100);
    const pctStr = pct.toFixed(1);
    const color = COLORS[i % COLORS.length];
    return '<div style="margin-bottom:7px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">' +
      '<span style="font-size:11px;color:var(--text)">' + p.name + '</span>' +
      '<span style="font-size:11px;font-weight:700;color:' + color + '">' + pctStr + '%</span>' +
      '</div>' +
      '<div style="height:5px;background:var(--bg3);border-radius:3px;overflow:hidden">' +
      '<div style="height:100%;width:' + pct.toFixed(1) + '%;background:' + color + ';border-radius:3px"></div>' +
      '</div>' +
      '</div>';
  }).join('');
}

// ── 미니 라인차트 ─────────────────────────────────────────────
// 미니 라인차트 (평가금액 카드 내부)
function drawPortfolioChart(snapshots, currentVal) {
  const canvas = document.getElementById('portfolio-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 120 * dpr; canvas.height = 48 * dpr;
  canvas.style.width = '120px'; canvas.style.height = '48px';
  ctx.scale(dpr, dpr);

  // 최근 14일 데이터 + 오늘 현재값
  const points = [...snapshots].reverse().slice(-13);
  const allVals = [...points.map(s => s.total_value), currentVal];
  if (allVals.length < 2) {
    ctx.fillStyle = 'rgba(144,144,168,0.3)';
    ctx.font = '9px sans-serif';
    ctx.fillText('데이터 수집 중', 4, 24);
    return;
  }

  const min = Math.min(...allVals) * 0.998;
  const max = Math.max(...allVals) * 1.002;
  const range = max - min || 1;
  const W = 120, H = 48, pad = 4;

  const toX = i => pad + (i / (allVals.length - 1)) * (W - pad * 2);
  const toY = v => H - pad - ((v - min) / range) * (H - pad * 2);

  const isUp = currentVal >= (points[0]?.total_value || currentVal);
  const color = isUp ? '#4caf7d' : '#f06060';

  // 그라데이션 fill
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, isUp ? 'rgba(76,175,125,0.25)' : 'rgba(240,96,96,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.beginPath();
  allVals.forEach((v, i) => {
    i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v));
  });
  ctx.lineTo(toX(allVals.length - 1), H);
  ctx.lineTo(toX(0), H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // 라인
  ctx.beginPath();
  allVals.forEach((v, i) => {
    i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v));
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // 마지막 점
  ctx.beginPath();
  ctx.arc(toX(allVals.length - 1), toY(currentVal), 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

async function renderPortfolio() {
  const [positions, indices, snapshots] = await Promise.all([
    sb.get('positions', '&status=eq.open'),
    fetchIndices(),
    sb.get('snapshots', '&order=date.desc&limit=30'),
  ]);

  // 오늘 스냅샷 저장 (장 마감 후 1회)
  await saveSnapshotIfNeeded(positions);

  // 전날 대비 계산
  const today = todayStr();
  const yesterday = snapshots.find(s => s.date < today);
  let totalInvest = 0, totalPnl = 0, posCount = 0, negCount = 0;
  positions.forEach(p => {
    const pnl = calcPnlAmt(p.entry, p.current_price, p.qty);
    totalInvest += p.entry * p.qty;
    totalPnl += pnl;
    if (pnl >= 0) posCount++; else negCount++;
  });
  const totalPct = totalInvest > 0 ? (totalPnl / totalInvest) * 100 : 0;
  const totalMarketVal = positions.reduce((s, p) => s + p.current_price * p.qty, 0);

  // 전날 대비
  const prevVal = yesterday?.total_value || null;
  const dayChange = prevVal ? totalMarketVal - prevVal : null;
  const dayChangePct = prevVal ? (dayChange / prevVal * 100) : null;

  const pctColor = totalPct >= 0 ? 'var(--green)' : 'var(--red)';

  function idxHtml(key) {
    const d = indices[key];
    if (!d || !d.price) return '<span style="font-size:11px;color:var(--text2)">—</span>';
    const c = d.change >= 0 ? 'var(--green)' : 'var(--red)';
    const sign = d.change >= 0 ? '+' : '';
    const chg = d.change !== null ? sign + d.change.toFixed(2) + '%' : '';
    const priceStr = d.price >= 1000 ? Math.round(d.price).toLocaleString() : d.price.toFixed(2);
    return '<div style="text-align:right">' +
      '<span style="font-size:12px;font-weight:700;color:var(--text)">' + priceStr + '</span>' +
      '<span style="font-size:11px;font-weight:600;color:' + c + ';margin-left:5px">' + chg + '</span>' +
      '</div>';
  }

  document.getElementById('summary-grid').innerHTML = `
    <div class="metric" style="grid-column:span 2;padding:14px 16px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div>
          <div class="metric-label">총 평가금액</div>
          <div style="font-size:26px;font-weight:700;color:var(--text);margin-top:4px;letter-spacing:-.5px">${fmtNum(totalMarketVal)}원</div>
          ${dayChange !== null ? `<div style="font-size:12px;font-weight:600;margin-top:4px;color:${dayChange>=0?'var(--green)':'var(--red)'}">전날 대비 ${dayChange>=0?'+':''}${fmtNum(dayChange)}원 (${dayChangePct>=0?'+':''}${dayChangePct.toFixed(2)}%)</div>` : '<div style="font-size:11px;color:var(--text3);margin-top:4px">전날 데이터 수집 중...</div>'}
        </div>
        <canvas id="portfolio-chart" width="96" height="38" style="margin-top:4px;flex-shrink:0"></canvas>
      </div>
      <div style="display:flex;gap:0;border-top:1px solid var(--border);padding-top:10px">
        <div style="flex:1;padding-right:10px">
          <div class="metric-label" style="margin-bottom:2px">평가손익</div>
          <div style="font-size:14px;font-weight:700;color:${pnlClass(totalPnl)==='pos'?'var(--green)':'var(--red)'}">${fmtNum(totalPnl)}원</div>
        </div>
        <div style="flex:1;padding:0 10px;border-left:1px solid var(--border)">
          <div class="metric-label" style="margin-bottom:2px">수익률</div>
          <div style="font-size:14px;font-weight:700;color:${pctColor}">${fmtPct(totalPct)}</div>
        </div>
        <div style="flex:1;padding-left:10px;border-left:1px solid var(--border)">
          <div class="metric-label" style="margin-bottom:2px">투자금</div>
          <div style="font-size:14px;font-weight:700;color:var(--text)">${fmtNum(totalInvest)}원</div>
        </div>
      </div>
    </div>
    <div class="metric" style="padding:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;height:22px">
        <div class="metric-label" style="margin-bottom:0">종목 현황</div>
        <button id="refresh-btn" onclick="refreshAllPrices()" style="background:var(--purple-bg);color:var(--purple);border:none;border-radius:6px;padding:3px 8px;font-size:10px;font-weight:600;cursor:pointer">현재가 갱신</button>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
        <canvas id="win-rate-ring" width="80" height="80"></canvas>
        <div style="display:flex;gap:5px;width:100%">
          <div style="flex:1;text-align:center;padding:7px 4px;background:rgba(76,175,125,0.1);border-radius:8px">
            <div style="font-size:9px;color:var(--green);margin-bottom:2px">수익</div>
            <div style="font-size:24px;font-weight:700;color:var(--green);line-height:1">${posCount}</div>
          </div>
          <div style="flex:1;text-align:center;padding:7px 4px;background:rgba(240,96,96,0.1);border-radius:8px">
            <div style="font-size:9px;color:var(--red);margin-bottom:2px">손실</div>
            <div style="font-size:24px;font-weight:700;color:var(--red);line-height:1">${negCount}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="metric" style="padding:12px">
      <div style="display:flex;align-items:center;height:22px;margin-bottom:12px">
        <div class="metric-label" style="margin-bottom:0">종목 비중</div>
      </div>
      <div id="donut-chart" style="width:100%"></div>
    </div>
    <div class="metric" id="index-section" style="overflow:hidden;grid-column:span 2">
      <div class="metric-label" style="margin-bottom:10px">주요 지수</div>
      <div style="overflow:hidden;height:66px">
        <div id="idx-ticker" style="display:flex;flex-direction:column;transition:transform .5s ease">
          <div style="height:22px;display:flex;align-items:center;gap:0">
            <span style="font-size:11px;color:var(--text2);width:64px;flex-shrink:0">KOSPI</span>
            <span style="font-size:12px;font-weight:700;color:var(--text);flex:1;text-align:right" id="idx-kospi">${idxHtml('kospi')}</span>
          </div>
          <div style="height:22px;display:flex;align-items:center;gap:0">
            <span style="font-size:11px;color:var(--text2);width:64px;flex-shrink:0">KOSDAQ</span>
            <span style="font-size:12px;font-weight:700;color:var(--text);flex:1;text-align:right" id="idx-kosdaq">${idxHtml('kosdaq')}</span>
          </div>
          <div style="height:22px;display:flex;align-items:center;gap:0">
            <span style="font-size:11px;color:var(--text2);width:64px;flex-shrink:0">S&P 500</span>
            <span style="font-size:12px;font-weight:700;color:var(--text);flex:1;text-align:right" id="idx-sp500">${idxHtml('sp500')}</span>
          </div>
          <div style="height:22px;display:flex;align-items:center;gap:0">
            <span style="font-size:11px;color:var(--text2);width:64px;flex-shrink:0">다우존스</span>
            <span style="font-size:12px;font-weight:700;color:var(--text);flex:1;text-align:right" id="idx-dji">${idxHtml('dji')}</span>
          </div>
          <div style="height:22px;display:flex;align-items:center;gap:0">
            <span style="font-size:11px;color:var(--text2);width:64px;flex-shrink:0">나스닥</span>
            <span style="font-size:12px;font-weight:700;color:var(--text);flex:1;text-align:right" id="idx-ixic">${idxHtml('ixic')}</span>
          </div>
          <div style="height:22px;display:flex;align-items:center;gap:0">
            <span style="font-size:11px;color:var(--text2);width:64px;flex-shrink:0">원/달러</span>
            <span style="font-size:12px;font-weight:700;color:var(--text);flex:1;text-align:right" id="idx-krw">${idxHtml('krw')}</span>
          </div>
          <div style="height:22px;display:flex;align-items:center;gap:0">
            <span style="font-size:11px;color:var(--text2);width:64px;flex-shrink:0">유가 WTI</span>
            <span style="font-size:12px;font-weight:700;color:var(--text);flex:1;text-align:right" id="idx-wti">${idxHtml('wti')}</span>
          </div>
          <div style="height:22px;display:flex;align-items:center;gap:0">
            <span style="font-size:11px;color:var(--text2);width:64px;flex-shrink:0">금</span>
            <span style="font-size:12px;font-weight:700;color:var(--text);flex:1;text-align:right" id="idx-gold">${idxHtml('gold')}</span>
          </div>
          <div style="height:22px;display:flex;align-items:center;gap:0">
            <span style="font-size:11px;color:var(--text2);width:64px;flex-shrink:0">비트코인</span>
            <span style="font-size:12px;font-weight:700;color:var(--text);flex:1;text-align:right" id="idx-btc">${idxHtml('btc')}</span>
          </div>
          <div style="height:22px;display:flex;align-items:center;gap:0">
            <span style="font-size:11px;color:var(--text2);width:64px;flex-shrink:0">KOSPI</span>
            <span style="font-size:12px;font-weight:700;color:var(--text);flex:1;text-align:right">${idxHtml('kospi')}</span>
          </div>
          <div style="height:22px;display:flex;align-items:center;gap:0">
            <span style="font-size:11px;color:var(--text2);width:64px;flex-shrink:0">KOSDAQ</span>
            <span style="font-size:12px;font-weight:700;color:var(--text);flex:1;text-align:right">${idxHtml('kosdaq')}</span>
          </div>
          <div style="height:22px;display:flex;align-items:center;gap:0">
            <span style="font-size:11px;color:var(--text2);width:64px;flex-shrink:0">S&P 500</span>
            <span style="font-size:12px;font-weight:700;color:var(--text);flex:1;text-align:right">${idxHtml('sp500')}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // 3개씩 슬라이드 인터벌
  if (window._idxTimer) clearInterval(window._idxTimer);
  let _idxGrp = 0;
  window._idxTimer = setInterval(() => {
    const el = document.getElementById('idx-ticker');
    if (!el) { clearInterval(window._idxTimer); return; }
    _idxGrp++;
    if (_idxGrp >= 3) {
      _idxGrp = 0;
      setTimeout(() => { el.style.transition='none'; el.style.transform='translateY(0)'; }, 500);
    } else {
      el.style.transition = 'transform .5s ease';
      el.style.transform = 'translateY(-' + (_idxGrp * 66) + 'px)';
    }
  }, 3000);

  // 미니 라인차트 그리기
  drawPortfolioChart(snapshots, totalMarketVal);
  // 승률 링
  drawWinRateRing(posCount, negCount);
  // 종목 비중 도넛 차트
  drawDonutChart(positions);

  const listEl = document.getElementById('portfolio-list');
  if (positions.length === 0) {
    listEl.innerHTML = '<div class="sort-bar"><button class="sort-btn active" id="sort-date" onclick="setSortPositions(\'date\')">날짜순</button><button class="sort-btn" id="sort-pnl" onclick="setSortPositions(\'pnl\')">수익률순</button><button class="sort-btn" id="sort-invest" onclick="setSortPositions(\'invest\')">투자금순</button></div><div class="empty">보유 포지션 없음<br>+ 신규 매매 버튼으로 추가하세요</div>';
    return;
  }
  checkPriceAlerts(positions);
  const sortedPositions = sortPositions(positions);
  listEl.innerHTML = '<div class="sort-bar"><button class="sort-btn' + (currentSort==='date'?' active':'') + '" id="sort-date" onclick="setSortPositions(\'date\')">날짜순</button><button class="sort-btn' + (currentSort==='pnl'?' active':'') + '" id="sort-pnl" onclick="setSortPositions(\'pnl\')">수익률순</button><button class="sort-btn' + (currentSort==='invest'?' active':'') + '" id="sort-invest" onclick="setSortPositions(\'invest\')">투자금순</button></div>';
  listEl.innerHTML += sortedPositions.map(p => {
    const pnlPct = calcPnlPct(p.entry, p.current_price);
    const pnlAmt = calcPnlAmt(p.entry, p.current_price, p.qty);
    const badge = p.type === 'core' ? 'badge-core' : 'badge-trade';
    const badgeText = p.type === 'core' ? '코어' : '트레이딩';
    const triggerClass = p.stop_trigger ? 'trigger-line' : 'trigger-line warn';
    const triggerText = p.stop_trigger || '⚠ 손절 트리거 미설정';
    return `
      <div class="pos-card" onclick="openPositionDetail(${p.id})">
        <div class="pos-card-top">
          <div>
            <div class="pos-name">${p.name} <span class="badge ${badge}">${badgeText}</span></div>
            <div class="pos-sub">${p.qty}주 · 평단 ${fmtNum(p.entry)}원 · ${p.date}</div>
          </div>
          <div class="pos-pnl">
            <div class="pos-pnl-pct ${pnlClass(pnlPct)}">${fmtPct(pnlPct)}</div>
            <div class="pos-pnl-amt ${pnlClass(pnlAmt)}">${fmtNum(pnlAmt)}원</div>
          </div>
        </div>
        <div class="pos-meta">
          <div class="pos-meta-item">현재가 <span>${fmtNum(p.current_price)}</span></div>
          <div class="pos-meta-item">목표가 <span>${p.target ? fmtNum(p.target) : '—'}</span></div>
          <div class="pos-meta-item">손절가 <span>${p.stop ? fmtNum(p.stop) : '—'}</span></div>
          <div class="pos-meta-item">확신도 <span>${p.conviction}/5</span></div>
        </div>
        <div class="thesis-box">${p.thesis || ''}</div>
        ${p.target && p.stop ? (() => {
          const range = p.target - p.stop;
          const prog = range > 0 ? Math.max(0, Math.min(100, ((p.current_price - p.stop) / range * 100))) : 0;
          const color = prog >= 80 ? 'var(--green)' : prog >= 40 ? 'var(--purple)' : 'var(--red)';
          return `<div style="margin-top:8px">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-bottom:3px">
              <span>손절 ${fmtNum(p.stop)}</span><span>목표 ${fmtNum(p.target)}</span>
            </div>
            <div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${prog.toFixed(1)}%;background:${color};border-radius:2px;transition:width 0.3s"></div>
            </div>
          </div>`;
        })() : ''}
        <div class="${triggerClass}">${triggerText}</div>
      </div>`;
  }).join('');
}

async function openPositionDetail(id) {
  const rows = await sb.get('positions', `&id=eq.${id}`);
  const p = rows[0]; if (!p) return;
  const pnlPct = calcPnlPct(p.entry, p.current_price);
  const pnlAmt = calcPnlAmt(p.entry, p.current_price, p.qty);
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-title">${p.name} 포지션 상세</div>
    <div class="pos-meta" style="margin-bottom:12px">
      <div class="pos-meta-item">수익률 <span class="${pnlClass(pnlPct)}">${fmtPct(pnlPct)}</span></div>
      <div class="pos-meta-item">평가손익 <span class="${pnlClass(pnlAmt)}">${fmtNum(pnlAmt)}원</span></div>
    </div>
    <div class="divider"></div>
    <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:0">
      <div style="flex:2">
        <div class="form-label">현재가 업데이트</div>
        <input class="form-input" type="number" id="detail-price" inputmode="decimal" value="${p.current_price}" style="margin-bottom:0">
      </div>
      <div style="flex:1">
        <div class="form-label">종목 코드 <span style="font-weight:400;color:var(--text3)">(6자리)</span></div>
        <input class="form-input" id="detail-code" value="${p.code || ''}" placeholder="003490" maxlength="6" style="margin-bottom:0" oninput="this.value=this.value.replace(/\D/g,'')">
      </div>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:8px;margin-top:4px">코드 없으면 현재가 자동 갱신 안 됨</div>
    <div class="form-label" style="margin-top:4px">thesis</div>
    <textarea class="form-input" id="detail-thesis">${p.thesis || ''}</textarea>
    <div class="form-label">손절 트리거</div>
    <textarea class="form-input" id="detail-trigger">${p.stop_trigger || ''}</textarea>
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="submit-btn submit-buy" style="flex:2" onclick="updatePosition(${id})">저장</button>
      <button class="submit-btn" style="flex:1;background:var(--red-bg);color:var(--red)" onclick="closePosition(${id})">매도 완료</button>
    </div>
    <div class="divider"></div>
    <button class="submit-btn" style="background:transparent;color:var(--text3);border:1px solid var(--border)" onclick="deletePosition(${id})">포지션 삭제</button>
  `;
  openModal();
}

async function updatePosition(id) {
  const code = document.getElementById('detail-code').value.trim();
  const name = (await sb.get('positions', `&id=eq.${id}`))[0]?.name;
  if (code && name) SYMBOL_MAP[name] = code;
  await sb.update('positions', id, {
    current_price: parseFloat(document.getElementById('detail-price').value),
    thesis: document.getElementById('detail-thesis').value,
    stop_trigger: document.getElementById('detail-trigger').value,
    code: code || null,
  });
  closeModal(); renderPortfolio();
}

async function deletePosition(id) {
  if (!confirm('이 포지션을 삭제할까요?')) return;
  await sb.delete('positions', id);
  closeModal(); renderPortfolio();
}

async function closePosition(id) {
  const rows = await sb.get('positions', `&id=eq.${id}`);
  const p = rows[0]; if (!p) return;
  const exitPrice = parseFloat(document.getElementById('detail-price').value) || p.current_price;
  await sb.insert('reviews', {
    name: p.name, type: p.type, entry: p.entry, exit: exitPrice, qty: p.qty,
    thesis: p.thesis, entry_date: p.date, exit_date: todayStr(),
    pnl_pct: calcPnlPct(p.entry, exitPrice), pnl_amt: calcPnlAmt(p.entry, exitPrice, p.qty),
    position_id: id,
  });
  await sb.update('positions', id, { status: 'closed' });
  closeModal(); renderPortfolio(); renderReview();
  // 복기 작성 유도
  setTimeout(() => {
    document.getElementById('modal-body').innerHTML = `
      <div class="modal-title">📝 복기 작성할까요?</div>
      <div style="font-size:14px;color:var(--text2);line-height:1.7;margin-bottom:20px">
        매도 완료됐어요.<br>지금 바로 복기를 작성하면 기억이 생생할 때 더 도움이 돼요.
      </div>
      <div style="display:flex;gap:8px">
        <button class="submit-btn submit-buy" style="flex:2" onclick="closeModal();document.querySelector('[data-tab=\'review\']').click()">지금 복기 작성</button>
        <button class="submit-btn" style="flex:1;background:transparent;color:var(--text3);border:1px solid var(--border)" onclick="closeModal()">나중에</button>
      </div>
    `;
    openModal();
  }, 300);
}

// 포지션으로 복귀 (매도 취소)
async function restorePosition(reviewId, positionId) {
  if (!confirm('매도를 취소하고 포지션으로 복귀할까요?')) return;
  await sb.delete('reviews', reviewId);
  await sb.update('positions', positionId, { status: 'open' });
  closeModal();
  renderPortfolio();
  renderReview();
  // 보유 포지션 탭으로 이동
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="portfolio"]').classList.add('active');
  document.getElementById('tab-portfolio').classList.add('active');
}

// ── 관심 종목 ─────────────────────────────────────────────────
async function renderWatchlist() {
  const list = await sb.get('watchlist');
  const el = document.getElementById('watchlist-list');
  if (list.length === 0) {
    el.innerHTML = '<div class="empty">관심 종목 없음<br>+ 버튼으로 추가하세요</div>'; return;
  }
  el.innerHTML = list.map(w => {
    const diff = w.current_price && w.target_entry
      ? ((w.current_price - w.target_entry) / w.target_entry * 100).toFixed(1) : null;
    const conds = (w.conditions || []).map((c, i) => `
      <div class="cond-row">
        <div class="cond-dot ${w.cond_status[i] ? 'ok' : 'pending'}"></div><span>${c}</span>
      </div>`).join('');
    return `
      <div class="watch-card" onclick="openWatchDetail(${w.id})">
        <div class="pos-card-top">
          <div>
            <div class="pos-name">${w.name} <span class="badge badge-watch">대기</span></div>
            <div class="pos-sub">목표 진입가 ${fmtNum(w.target_entry)}원</div>
          </div>
          <div class="pos-pnl">
            <div class="pos-pnl-pct ${diff !== null && parseFloat(diff) <= 0 ? 'pos' : 'neg'}">${diff !== null ? diff + '%' : '—'}</div>
            <div class="pos-pnl-amt" style="color:var(--text3)">현재 ${fmtNum(w.current_price)}</div>
          </div>
        </div>
        <div class="thesis-box">${w.thesis || ''}</div>
        ${conds}
      </div>`;
  }).join('');
}

function openWatchModal() {
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-title">관심 종목 추가</div>
    <div class="form-label">종목명</div>
    <input class="form-input" id="w-name" placeholder="종목명">
    <div class="form-label">종목 코드</div>
    <input class="form-input" id="w-code" placeholder="ex) 005490" maxlength="6">
    <div class="form-label">목표 진입가</div>
    <input class="form-input" type="number" id="w-target" inputmode="decimal" placeholder="280,000">
    <div class="form-label">현재가</div>
    <input class="form-input" type="number" id="w-current" inputmode="decimal" placeholder="308,000">
    <div class="form-label">투자 thesis</div>
    <textarea class="form-input" id="w-thesis" placeholder="왜 이 종목에 관심을 갖는지..."></textarea>
    <div class="form-label">진입 조건 (한 줄씩)</div>
    <textarea class="form-input" id="w-conds" placeholder="목표가 도달&#10;거래량 평균 이상&#10;섹터 thesis 유효"></textarea>
    <button class="submit-btn submit-watch" onclick="addWatch()">관심 종목 저장</button>
  `;
  openModal();
}

async function addWatch() {
  const name = document.getElementById('w-name').value.trim();
  if (!name) return;
  const conds = document.getElementById('w-conds').value.split('\n').filter(c => c.trim());
  await sb.insert('watchlist', {
    name, code: document.getElementById('w-code').value.trim(),
    target_entry: parseFloat(document.getElementById('w-target').value) || null,
    current_price: parseFloat(document.getElementById('w-current').value) || null,
    thesis: document.getElementById('w-thesis').value.trim(),
    conditions: conds, cond_status: conds.map(() => false), date: todayStr()
  });
  closeModal(); renderWatchlist();
}

async function openWatchDetail(id) {
  const rows = await sb.get('watchlist', `&id=eq.${id}`);
  const w = rows[0]; if (!w) return;
  const condRows = (w.conditions || []).map((c, i) => `
    <div class="cond-row" style="cursor:pointer" onclick="toggleCond(${id},${i})">
      <div class="cond-dot ${w.cond_status[i] ? 'ok' : 'pending'}"></div><span>${c}</span>
    </div>`).join('');
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-title">${w.name} 관심 종목</div>
    <div class="form-label">조건 충족 여부 (탭해서 토글)</div>
    ${condRows}
    <div class="divider"></div>
    <div class="form-label">현재가 업데이트</div>
    <input class="form-input" type="number" id="wd-price" inputmode="decimal" value="${w.current_price || ''}">
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="submit-btn submit-watch" style="flex:2" onclick="updateWatch(${id})">저장</button>
      <button class="submit-btn submit-buy" style="flex:1" onclick="convertToPosition(${id})">매수 진입</button>
    </div>
    <div class="divider"></div>
    <button class="submit-btn" style="background:transparent;color:var(--text3);border:1px solid var(--border)" onclick="deleteWatch(${id})">관심 종목 삭제</button>
  `;
  openModal();
}

async function toggleCond(wid, ci) {
  const rows = await sb.get('watchlist', `&id=eq.${wid}`);
  const w = rows[0]; if (!w) return;
  const newStatus = [...w.cond_status];
  newStatus[ci] = !newStatus[ci];
  await sb.update('watchlist', wid, { cond_status: newStatus });
  openWatchDetail(wid);
}

async function updateWatch(id) {
  await sb.update('watchlist', id, { current_price: parseFloat(document.getElementById('wd-price').value) || null });
  closeModal(); renderWatchlist();
}

async function deleteWatch(id) {
  if (!confirm('이 관심 종목을 삭제할까요?')) return;
  await sb.delete('watchlist', id);
  closeModal(); renderWatchlist();
}

async function convertToPosition(id) {
  const rows = await sb.get('watchlist', `&id=eq.${id}`);
  const w = rows[0]; if (!w) return;
  closeModal();
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="entry"]').classList.add('active');
  document.getElementById('tab-entry').classList.add('active');
  renderEntryForm(w.name, w.thesis, w.code || '');
}

// ── 매매 전 체크 ──────────────────────────────────────────────
let entryState = { dir: 'buy', type: 'core', conv: 3, emo: 'cold' };

function renderEntryForm(prefillName = '', prefillThesis = '', prefillCode = '') {
  document.getElementById('entry-form').innerHTML = `
    <div class="form-section">
      <div class="form-label">종목명</div>
      <input class="form-input" id="e-name" placeholder="종목명" value="${prefillName}">
      <div class="form-label">종목 코드 <span style="font-weight:400;color:var(--text3)">(6자리 · 네이버 금융에서 확인)</span></div>
      <input class="form-input" id="e-code" placeholder="ex) 003490" maxlength="6" value="${prefillCode}" oninput="this.value=this.value.replace(/\\D/g,'')">
      <div style="font-size:11px;color:var(--text3);margin-top:-4px;margin-bottom:8px">네이버 금융 검색 → 종목 클릭 → URL의 code= 뒤 숫자</div>
      <div class="form-label">방향</div>
      <div class="toggle-group">
        <button class="toggle-btn active-buy" id="e-buy" onclick="setEntryDir('buy')">매수</button>
        <button class="toggle-btn" id="e-sell" onclick="setEntryDir('sell')">매도</button>
      </div>
      <div class="form-label">포지션 타입</div>
      <div class="toggle-group">
        <button class="toggle-btn active-core" id="e-core" onclick="setEntryType('core')">코어<br><small style="font-weight:400;opacity:0.7">펀더멘털</small></button>
        <button class="toggle-btn" id="e-trade" onclick="setEntryType('trade')">트레이딩<br><small style="font-weight:400;opacity:0.7">가격 기준</small></button>
        <button class="toggle-btn" id="e-watch" onclick="setEntryType('watch')">관심 대기<br><small style="font-weight:400;opacity:0.7">조건 설정</small></button>
      </div>
    </div>
    <div class="form-section">
      <div class="form-label">가격</div>
      <div class="price-grid">
        <div class="price-cell"><div class="price-cell-label">진입가</div><input type="number" id="e-entry" placeholder="23,800" inputmode="decimal" oninput="calcEntryRR()"></div>
        <div class="price-cell"><div class="price-cell-label" id="e-stop-label">손절가</div><input type="number" id="e-stop" placeholder="22,000" inputmode="decimal" oninput="calcEntryRR()"></div>
        <div class="price-cell"><div class="price-cell-label">목표가</div><input type="number" id="e-target" placeholder="31,000" inputmode="decimal" oninput="calcEntryRR()"></div>
      </div>
      <div class="rr-line">리스크/리워드: <span id="e-rr">—</span></div>
      <div class="form-label">수량</div>
      <input class="form-input" type="number" id="e-qty" placeholder="65" inputmode="numeric">
    </div>
    <div class="form-section">
      <div class="form-label" id="e-trigger-label">손절 트리거 (코어: 이벤트 기준)</div>
      <textarea class="form-input" id="e-trigger" placeholder="ex) LCC 점유율 급등 / 합병 부채 감당 불가" oninput="updateEntryChecks()"></textarea>
      <div class="form-label">진입 근거</div>
      <textarea class="form-input" id="e-memo" placeholder="차트 지지선, 매크로 이벤트, 펀더멘털 근거..." oninput="updateEntryChecks()">${prefillThesis}</textarea>
    </div>
    <div class="form-section">
      <div class="form-label">확신도</div>
      <div class="toggle-group">
        ${[1,2,3,4,5].map(n => `<button class="toggle-btn ${n===3?'active-conv':''}" id="e-conv-${n}" onclick="setEntryConv(${n})">${n}</button>`).join('')}
      </div>
      <div class="form-label" style="margin-top:8px">감정 상태</div>
      <div class="toggle-group">
        <button class="toggle-btn active-cold" id="e-cold" onclick="setEntryEmo('cold')">냉정</button>
        <button class="toggle-btn" id="e-warn" onclick="setEntryEmo('warn')">약간 흥분</button>
        <button class="toggle-btn" id="e-hot" onclick="setEntryEmo('hot')">FOMO</button>
      </div>
    </div>
    <div class="checklist">
      <div class="check-row"><div class="ck no" id="ck1"></div>손절 트리거 입력됨</div>
      <div class="check-row"><div class="ck no" id="ck2"></div>진입 근거 입력됨</div>
      <div class="check-row"><div class="ck no" id="ck3"></div>목표가 또는 진입가 설정됨</div>
      <div class="check-row"><div class="ck ok" id="ck4">✓</div>R/R 확인</div>
      <div class="check-row"><div class="ck ok" id="ck5">✓</div>감정 상태: 냉정</div>
    </div>
    <button class="submit-btn submit-locked" id="e-submit" onclick="submitEntry()">체크리스트를 완료하세요</button>
  `;
  entryState = { dir: 'buy', type: 'core', conv: 3, emo: 'cold' };
}

function setEntryDir(d) {
  entryState.dir = d;
  document.getElementById('e-buy').className = 'toggle-btn' + (d==='buy' ? ' active-buy' : '');
  document.getElementById('e-sell').className = 'toggle-btn' + (d==='sell' ? ' active-sell' : '');
  updateEntryChecks();
}

function setEntryType(t) {
  entryState.type = t;
  ['core','trade','watch'].forEach(x => {
    document.getElementById('e-' + x).className = 'toggle-btn' + (x===t ? ' active-' + x : '');
  });
  const tl = document.getElementById('e-trigger-label');
  const sl = document.getElementById('e-stop-label');
  const ti = document.getElementById('e-trigger');
  if (t === 'core') {
    tl.textContent = '손절 트리거 (코어: 이벤트 기준)';
    sl.textContent = '손절가 (참고)';
    ti.placeholder = 'ex) LCC 점유율 급등 / 합병 부채비율 감당 불가';
  } else if (t === 'trade') {
    tl.textContent = '손절가 (트레이딩: 가격 이탈 기준)';
    sl.textContent = '손절가 (필수)';
    ti.placeholder = 'ex) 22,000 이탈 시 즉시 손절';
  } else {
    tl.textContent = '진입 조건';
    sl.textContent = '목표 진입가';
    ti.placeholder = 'ex) 280,000 도달 + 거래량 평균 이상 확인';
  }
}

function setEntryConv(n) {
  entryState.conv = n;
  [1,2,3,4,5].forEach(i => {
    document.getElementById('e-conv-' + i).className = 'toggle-btn' + (i===n ? ' active-conv' : '');
  });
}

function setEntryEmo(e) {
  entryState.emo = e;
  document.getElementById('e-cold').className = 'toggle-btn' + (e==='cold' ? ' active-cold' : '');
  document.getElementById('e-warn').className = 'toggle-btn' + (e==='warn' ? ' active-warn' : '');
  document.getElementById('e-hot').className = 'toggle-btn' + (e==='hot' ? ' active-hot' : '');
  updateEntryChecks();
}

function calcEntryRR() {
  const e = parseFloat(document.getElementById('e-entry').value);
  const s = parseFloat(document.getElementById('e-stop').value);
  const t = parseFloat(document.getElementById('e-target').value);
  const el = document.getElementById('e-rr');
  if (!e || !s || !t) { el.textContent = '—'; el.className = ''; updateEntryChecks(); return; }
  const risk = Math.abs(e - s), reward = Math.abs(t - e);
  if (!risk) { updateEntryChecks(); return; }
  const rr = (reward / risk).toFixed(1);
  el.textContent = '1 : ' + rr;
  el.className = parseFloat(rr) >= 1 ? 'rr-ok' : 'rr-bad';
  updateEntryChecks();
}

function setck(id, state) {
  const el = document.getElementById(id); if (!el) return;
  el.className = 'ck ' + state;
  el.textContent = state === 'ok' ? '✓' : state === 'wn' ? '!' : '';
}

function updateEntryChecks() {
  const hasTrigger = (document.getElementById('e-trigger')?.value || '').trim().length > 5;
  const hasMemo = (document.getElementById('e-memo')?.value || '').trim().length > 5;
  const hasTarget = !!(document.getElementById('e-target')?.value || document.getElementById('e-entry')?.value);
  const e = parseFloat(document.getElementById('e-entry')?.value);
  const s = parseFloat(document.getElementById('e-stop')?.value);
  const t = parseFloat(document.getElementById('e-target')?.value);
  const rrOk = e && s && t ? Math.abs(t-e)/Math.abs(e-s) >= 1 : true;
  setck('ck1', hasTrigger ? 'ok' : 'no');
  setck('ck2', hasMemo ? 'ok' : 'no');
  setck('ck3', hasTarget ? 'ok' : 'no');
  setck('ck4', rrOk ? 'ok' : 'no');
  setck('ck5', entryState.emo === 'cold' ? 'ok' : entryState.emo === 'warn' ? 'wn' : 'no');
  const allOk = hasTrigger && hasMemo && hasTarget;
  const btn = document.getElementById('e-submit'); if (!btn) return;
  if (allOk) {
    if (entryState.type === 'watch') { btn.className = 'submit-btn submit-watch'; btn.textContent = '관심 종목으로 저장'; }
    else { btn.className = 'submit-btn ' + (entryState.dir === 'buy' ? 'submit-buy' : 'submit-sell'); btn.textContent = (entryState.dir === 'buy' ? '매수' : '매도') + ' 기록 저장 — 이제 주문하세요'; }
  } else { btn.className = 'submit-btn submit-locked'; btn.textContent = '체크리스트를 완료하세요'; }
}

async function submitEntry() {
  const btn = document.getElementById('e-submit');
  if (!btn || btn.classList.contains('submit-locked')) return;
  const name = document.getElementById('e-name').value.trim();
  if (!name) { alert('종목명을 입력하세요'); return; }
  const code = document.getElementById('e-code').value.trim();
  if (code) SYMBOL_MAP[name] = code;

  btn.disabled = true; btn.textContent = '저장 중...';

  if (entryState.type === 'watch') {
    const conds = document.getElementById('e-trigger').value.split('\n').filter(c => c.trim());
    await sb.insert('watchlist', {
      name, code,
      target_entry: parseFloat(document.getElementById('e-stop').value) || null,
      current_price: parseFloat(document.getElementById('e-entry').value) || null,
      thesis: document.getElementById('e-memo').value.trim(),
      conditions: conds.length ? conds : [document.getElementById('e-trigger').value.trim()],
      cond_status: conds.map(() => false), date: todayStr()
    });
    renderWatchlist();
  } else {
    await sb.insert('positions', {
      name, code, type: entryState.type, dir: entryState.dir,
      entry: parseFloat(document.getElementById('e-entry').value) || 0,
      qty: parseInt(document.getElementById('e-qty').value) || 0,
      target: parseFloat(document.getElementById('e-target').value) || null,
      stop: parseFloat(document.getElementById('e-stop').value) || null,
      stop_trigger: document.getElementById('e-trigger').value.trim(),
      thesis: document.getElementById('e-memo').value.trim(),
      conviction: entryState.conv, emotion: entryState.emo,
      current_price: parseFloat(document.getElementById('e-entry').value) || 0,
      date: todayStr(), status: 'open'
    });
    renderPortfolio();
  }

  renderEntryForm();
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="portfolio"]').classList.add('active');
  document.getElementById('tab-portfolio').classList.add('active');
}

// ── 복기 ──────────────────────────────────────────────────────
async function renderReview() {
  const reviews = await sb.get('reviews');
  const el = document.getElementById('review-list'); if (!el) return;
  if (reviews.length === 0) {
    el.innerHTML = '<div class="empty">아직 복기할 거래가 없어요<br>매도 완료 후 자동으로 쌓입니다</div>'; return;
  }
  el.innerHTML = reviews.slice().reverse().map(r => `
    <div class="review-card" onclick="openReviewDetail(${r.id})">
      <div class="pos-card-top">
        <div>
          <div class="pos-name">${r.name} <span class="badge badge-closed">${r.type === 'core' ? '코어' : '트레이딩'}</span></div>
          <div class="pos-sub">${r.entry_date} → ${r.exit_date}</div>
        </div>
        <div class="pos-pnl">
          <div class="review-outcome ${pnlClass(r.pnl_pct)}">${fmtPct(r.pnl_pct)}</div>
          <div class="pos-pnl-amt ${pnlClass(r.pnl_amt)}">${fmtNum(r.pnl_amt)}원</div>
        </div>
      </div>
      <div class="thesis-box">${r.thesis || ''}</div>
      ${r.learned ? `<div class="review-qa"><div class="review-q">배운 점</div><div class="review-a">${r.learned}</div></div>` : '<div class="trigger-line warn">복기 미작성 — 탭해서 작성하세요</div>'}
    </div>`).join('');
}

async function openReviewDetail(id) {
  const rows = await sb.get('reviews', `&id=eq.${id}`);
  const r = rows[0]; if (!r) return;
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-title">${r.name} 복기</div>
    <div class="pos-meta" style="margin-bottom:12px">
      <div class="pos-meta-item">진입 <span>${fmtNum(r.entry)}</span></div>
      <div class="pos-meta-item">청산 <span>${fmtNum(r.exit)}</span></div>
      <div class="pos-meta-item">결과 <span class="${pnlClass(r.pnl_pct)}">${fmtPct(r.pnl_pct)}</span></div>
    </div>
    <div class="divider"></div>
    <div class="form-label">thesis가 깨졌나, 아직 살아있나?</div>
    <div class="toggle-group">
      <button class="toggle-btn ${r.thesis_broke==='alive'?'active-buy':''}" onclick="setThesisBroke(${id},'alive',this,'active-buy')">살아있었음</button>
      <button class="toggle-btn ${r.thesis_broke==='broke'?'active-sell':''}" onclick="setThesisBroke(${id},'broke',this,'active-sell')">thesis 깨짐</button>
      <button class="toggle-btn ${r.thesis_broke==='early'?'active-warn':''}" onclick="setThesisBroke(${id},'early',this,'active-warn')">너무 일찍 청산</button>
    </div>
    <div class="form-label">실제로 어떻게 됐나</div>
    <textarea class="form-input" id="rv-happened" placeholder="예상과 뭐가 달랐나...">${r.what_happened||''}</textarea>
    <div class="form-label">배운 점</div>
    <textarea class="form-input" id="rv-learned" placeholder="다음에 다르게 할 것...">${r.learned||''}</textarea>
    <div style="display:flex;gap:8px">
      <button class="submit-btn submit-buy" style="flex:2" onclick="saveReviewDetail(${id})">복기 저장</button>
      <button class="submit-btn" style="flex:1;background:transparent;color:var(--text3);border:1px solid var(--border)" onclick="deleteReview(${id})">삭제</button>
    </div>
    ${r.position_id ? `
    <div class="divider"></div>
    <button class="submit-btn" style="background:var(--amber-bg);color:var(--amber);border:1px solid rgba(240,160,48,0.3)" onclick="restorePosition(${id}, ${r.position_id})">
      ↩ 매도 취소 — 포지션으로 복귀
    </button>` : ''}
  `;
  openModal();
}

async function setThesisBroke(id, val, btn, cls) {
  await sb.update('reviews', id, { thesis_broke: val });
  btn.parentElement.querySelectorAll('.toggle-btn').forEach(b => b.className = 'toggle-btn');
  btn.classList.add(cls);
}

async function saveReviewDetail(id) {
  await sb.update('reviews', id, {
    what_happened: document.getElementById('rv-happened').value,
    learned: document.getElementById('rv-learned').value,
  });
  closeModal(); renderReview();
}

async function deleteReview(id) {
  if (!confirm('복기 기록을 삭제할까요?')) return;
  await sb.delete('reviews', id);
  closeModal(); renderReview();
}

// ── 모달 ──────────────────────────────────────────────────────
function openModal() { document.getElementById('modal-overlay').classList.add('open'); }
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }
function openEntryModal() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="entry"]').classList.add('active');
  document.getElementById('tab-entry').classList.add('active');
  renderEntryForm();
}

// ── 초기화 (auth.js showApp()에서 호출) ───────────────────────
function showLoading(elId) {
  const el = document.getElementById(elId);
  if (el) el.innerHTML = '<div class="skeleton-wrap"><div class="skeleton"></div><div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:85%"></div></div>';
}

function initApp() {
  document.getElementById('today-date').textContent = todayStr();
  showLoading('portfolio-list');
  showLoading('summary-grid');
  renderPortfolio();
  renderEntryForm();
}

// ── 자동 갱신 ──────────────────────────────────────────────────
function isMarketHours() {
  const now = new Date();
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const day = kst.getDay(); // 0=일, 6=토
  const h = kst.getHours();
  const m = kst.getMinutes();
  const minutes = h * 60 + m;
  if (day === 0 || day === 6) return false;
  return minutes >= 9 * 60 && minutes <= 15 * 60 + 30;
}

// 지수 3분마다 자동 갱신 (장중만)
async function autoRefreshIndices() {
  if (!isMarketHours()) return;
  const indices = await fetchIndices();
  const el = document.getElementById('index-section');
  if (!el) return;
  ['kospi','kosdaq','sp500','dji','ixic','krw','wti','gold','btc'].forEach(key => {
    const cell = document.getElementById('idx-' + key);
    if (!cell) return;
    const d = indices[key];
    if (!d || !d.price) return;
    const c = d.change >= 0 ? 'var(--green)' : 'var(--red)';
    const sign = d.change >= 0 ? '+' : '';
    const chg = d.change !== null ? sign + d.change.toFixed(2) + '%' : '';
    const priceStr = d.price >= 1000 ? Math.round(d.price).toLocaleString() : d.price.toFixed(2);
    cell.innerHTML = '<div style="text-align:right"><span style="font-size:12px;font-weight:700;color:var(--text)">' + priceStr + '</span><span style="font-size:11px;font-weight:600;color:' + c + ';margin-left:5px">' + chg + '</span></div>';
  });
}

// 종목 현재가 5분마다 자동 갱신 (장중만)
async function autoRefreshPrices() {
  if (!isMarketHours()) return;
  const positions = await sb.get('positions', '&status=eq.open');
  if (positions.length === 0) return;
  positions.forEach(p => { if (p.code) SYMBOL_MAP[p.name] = p.code; });
  let updated = false;
  for (const p of positions) {
    const code = p.code || SYMBOL_MAP[p.name];
    if (!code) continue;
    try {
      const res = await fetch('/api/price?symbol=' + code);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.price) { await sb.update('positions', p.id, { current_price: data.price }); updated = true; }
    } catch { continue; }
  }
  if (updated) renderPortfolio();
}

setInterval(autoRefreshIndices, 3 * 60 * 1000);   // 3분
setInterval(autoRefreshPrices,  5 * 60 * 1000);   // 5분

// ④ 관심종목 현재가 자동 갱신 (장중 5분마다)
async function autoRefreshWatchlist() {
  if (!isMarketHours()) return;
  const list = await sb.get('watchlist');
  if (list.length === 0) return;
  let updated = false;
  for (const w of list) {
    const code = w.code || SYMBOL_MAP[w.name];
    if (!code) continue;
    try {
      const res = await fetch('/api/price?symbol=' + code);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.price) { await sb.update('watchlist', w.id, { current_price: data.price }); updated = true; }
    } catch { continue; }
  }
  if (updated) renderWatchlist();
}
setInterval(autoRefreshWatchlist, 5 * 60 * 1000);   // 5분

// ════════════════════════════════════════════════════════════════
// ① 수익률 통계
// ════════════════════════════════════════════════════════════════
async function renderStats() {
  const reviews = await sb.get('reviews');
  const el = document.getElementById('stats-content'); if (!el) return;
  // 그래프 먼저 렌더
  renderPortfolioGraph();
  if (reviews.length === 0) {
    el.innerHTML = '<div class="empty">복기 데이터가 없어요<br>매도 완료 후 자동으로 쌓입니다</div>'; return;
  }
  const wins = reviews.filter(r => r.pnl_pct >= 0);
  const losses = reviews.filter(r => r.pnl_pct < 0);
  const winRate = (wins.length / reviews.length * 100).toFixed(1);
  const avgWin = wins.length ? (wins.reduce((s,r) => s + r.pnl_pct, 0) / wins.length).toFixed(2) : 0;
  const avgLoss = losses.length ? (losses.reduce((s,r) => s + r.pnl_pct, 0) / losses.length).toFixed(2) : 0;
  const totalPnl = reviews.reduce((s,r) => s + (r.pnl_amt || 0), 0);
  const cores = reviews.filter(r => r.type === 'core');
  const trades = reviews.filter(r => r.type !== 'core');
  const coreWinRate = cores.length ? (cores.filter(r => r.pnl_pct >= 0).length / cores.length * 100).toFixed(1) : '—';
  const tradeWinRate = trades.length ? (trades.filter(r => r.pnl_pct >= 0).length / trades.length * 100).toFixed(1) : '—';

  // 월별 손익
  const byMonth = {};
  reviews.forEach(r => {
    const m = (r.exit_date || '').slice(0, 7).replace('.', '-').slice(0, 7);
    if (!m) return;
    byMonth[m] = (byMonth[m] || 0) + (r.pnl_amt || 0);
  });
  const months = Object.keys(byMonth).sort();
  const maxAbs = Math.max(...Object.values(byMonth).map(Math.abs), 1);

  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">총 거래</div>
        <div class="stat-val">${reviews.length}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">승률</div>
        <div class="stat-val ${parseFloat(winRate) >= 50 ? 'pos' : 'neg'}">${winRate}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">평균 수익</div>
        <div class="stat-val pos">+${avgWin}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">평균 손실</div>
        <div class="stat-val neg">${avgLoss}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">누적 손익</div>
        <div class="stat-val ${totalPnl >= 0 ? 'pos' : 'neg'}">${fmtNum(totalPnl)}원</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">코어 승률</div>
        <div class="stat-val">${coreWinRate}${coreWinRate !== '—' ? '%' : ''}</div>
      </div>
    </div>
    <div class="section-label" style="margin-top:16px;margin-bottom:10px">월별 손익</div>
    <div class="month-chart">
      ${months.map(m => {
        const v = byMonth[m];
        const pct = Math.abs(v) / maxAbs * 100;
        const color = v >= 0 ? 'var(--green)' : 'var(--red)';
        return `<div class="month-bar-wrap">
          <div class="month-bar-label">${m.slice(5)}</div>
          <div class="month-bar-track">
            <div class="month-bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <div class="month-bar-val" style="color:${color}">${v >= 0 ? '+' : ''}${fmtNum(v)}</div>
        </div>`;
      }).join('')}
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════
// ③ 매매 메모/일기
// ════════════════════════════════════════════════════════════════
async function renderDiary() {
  const entries = await sb.get('diary');
  const el = document.getElementById('diary-list'); if (!el) return;
  el.innerHTML = entries.length === 0
    ? '<div class="empty">아직 메모가 없어요<br>+ 버튼으로 추가하세요</div>'
    : entries.slice().reverse().map(d => `
        <div class="diary-card" onclick="openDiaryDetail(${d.id})">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="font-size:12px;font-weight:600;color:var(--purple)">${d.date}</div>
            <div style="font-size:11px;color:var(--text3)">${d.mood || ''}</div>
          </div>
          <div style="font-size:13px;color:var(--text2);line-height:1.6">${(d.content || '').slice(0, 100)}${(d.content||'').length > 100 ? '...' : ''}</div>
        </div>`).join('');
}

function openDiaryModal() {
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-title">매매 메모</div>
    <div class="form-label">날짜</div>
    <input class="form-input" id="d-date" value="${todayStr()}">
    <div class="form-label">오늘 시장 느낌</div>
    <div class="toggle-group">
      <button class="toggle-btn" id="d-mood-bull" onclick="setDiaryMood('강세 📈')">강세 📈</button>
      <button class="toggle-btn" id="d-mood-bear" onclick="setDiaryMood('약세 📉')">약세 📉</button>
      <button class="toggle-btn" id="d-mood-side" onclick="setDiaryMood('횡보 😐')">횡보 😐</button>
    </div>
    <div class="form-label">메모</div>
    <textarea class="form-input" id="d-content" placeholder="오늘 시장 흐름, 실수, 배운 것..." style="min-height:120px"></textarea>
    <button class="submit-btn submit-buy" onclick="saveDiary()">저장</button>
  `;
  openModal();
}

let _diaryMood = '';
function setDiaryMood(mood) {
  _diaryMood = mood;
  ['bull','bear','side'].forEach(k => document.getElementById('d-mood-' + k).className = 'toggle-btn');
  const map = {'강세 📈':'bull','약세 📉':'bear','횡보 😐':'side'};
  if (map[mood]) document.getElementById('d-mood-' + map[mood]).className = 'toggle-btn active-buy';
}

async function saveDiary() {
  const content = document.getElementById('d-content').value.trim();
  if (!content) return;
  await sb.insert('diary', { date: document.getElementById('d-date').value, mood: _diaryMood, content });
  closeModal(); renderDiary();
}

async function openDiaryDetail(id) {
  const rows = await sb.get('diary', `&id=eq.${id}`);
  const d = rows[0]; if (!d) return;
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-title">${d.date} ${d.mood || ''}</div>
    <div class="form-label">메모</div>
    <textarea class="form-input" id="d-edit-content" style="min-height:140px">${d.content || ''}</textarea>
    <div style="display:flex;gap:8px">
      <button class="submit-btn submit-buy" style="flex:2" onclick="updateDiary(${id})">수정 저장</button>
      <button class="submit-btn" style="flex:1;background:transparent;color:var(--text3);border:1px solid var(--border)" onclick="deleteDiary(${id})">삭제</button>
    </div>
  `;
  openModal();
}

async function updateDiary(id) {
  await sb.update('diary', id, { content: document.getElementById('d-edit-content').value });
  closeModal(); renderDiary();
}

async function deleteDiary(id) {
  if (!confirm('메모를 삭제할까요?')) return;
  await sb.delete('diary', id);
  closeModal(); renderDiary();
}

// ════════════════════════════════════════════════════════════════
// ⑥ CSV 내보내기
// ════════════════════════════════════════════════════════════════
async function exportCSV() {
  const reviews = await sb.get('reviews');
  if (reviews.length === 0) { alert('내보낼 거래 기록이 없어요'); return; }
  const headers = ['종목','타입','진입가','청산가','수량','수익률(%)','손익(원)','진입일','청산일','배운점'];
  const rows = reviews.map(r => [
    r.name, r.type === 'core' ? '코어' : '트레이딩',
    r.entry, r.exit, r.qty,
    Number(r.pnl_pct).toFixed(2), Math.round(r.pnl_amt),
    r.entry_date, r.exit_date,
    (r.learned || '').replace(/,/g, '，')
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `매매일지_${todayStr()}.csv`; a.click();
  URL.revokeObjectURL(url);
}


// ════════════════════════════════════════════════════════════════
// ⑧ 다크/라이트 모드
// ════════════════════════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('theme');
  // 명시적으로 light를 선택한 경우만 라이트모드, 나머지는 다크
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  localStorage.setItem('theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
}

function toggleTheme() {
  const current = localStorage.getItem('theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ════════════════════════════════════════════════════════════════
// ⑨ 포지션 정렬
// ════════════════════════════════════════════════════════════════
let currentSort = 'date';

function setSortPositions(type) {
  currentSort = type;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('sort-' + type);
  if (btn) btn.classList.add('active');
  renderPortfolio();
}

function sortPositions(positions) {
  const arr = [...positions];
  if (currentSort === 'pnl') {
    return arr.sort((a, b) => {
      const pa = calcPnlPct(a.entry, a.current_price);
      const pb = calcPnlPct(b.entry, b.current_price);
      return pb - pa;
    });
  }
  if (currentSort === 'invest') {
    return arr.sort((a, b) => (b.entry * b.qty) - (a.entry * a.qty));
  }
  // 날짜순 (기본)
  return arr.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

// ════════════════════════════════════════════════════════════════
// ⑩ 브라우저 푸시 알림
// ════════════════════════════════════════════════════════════════
async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function sendNotification(title, body) {
  if (Notification.permission !== 'granted') return;
  new Notification(title, { body, icon: '/favicon.ico' });
}

async function checkPriceAlerts(positions) {
  if (!isMarketHours()) return;
  for (const p of positions) {
    const pnlPct = calcPnlPct(p.entry, p.current_price);
    // 목표가 90% 이상 도달
    if (p.target && p.current_price >= p.target * 0.97) {
      sendNotification(`🎯 ${p.name} 목표가 근접`, `현재가 ${fmtNum(p.current_price)}원 — 목표가 ${fmtNum(p.target)}원`);
    }
    // 손절가 근접 (5% 이내)
    if (p.stop && p.current_price <= p.stop * 1.05) {
      sendNotification(`⚠️ ${p.name} 손절가 근접`, `현재가 ${fmtNum(p.current_price)}원 — 손절가 ${fmtNum(p.stop)}원`);
    }
  }
}


// ════════════════════════════════════════════════════════════════
// 스냅샷 저장 + 차트
// ════════════════════════════════════════════════════════════════

// 하루 1번 장 마감 후 스냅샷 저장
async function saveSnapshotIfNeeded(positions) {
  if (!currentUser) return;
  const today = todayStr();
  // 오늘 스냅샷 이미 있으면 스킵
  const existing = await sb.get('snapshots', `&date=eq.${today}&user_id=eq.${currentUser.id}`);
  if (existing.length > 0) return;
  // 장 마감 후에만 저장 (15:30 이후 or 주말)
  const now = new Date();
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const day = kst.getDay();
  const minutes = kst.getHours() * 60 + kst.getMinutes();
  const isWeekend = day === 0 || day === 6;
  const isAfterClose = minutes >= 15 * 60 + 30;
  if (!isWeekend && !isAfterClose) return;

  const totalInvest = positions.reduce((s, p) => s + p.entry * p.qty, 0);
  const totalValue = positions.reduce((s, p) => s + p.current_price * p.qty, 0);
  const totalPnl = totalValue - totalInvest;
  await sb.insert('snapshots', { date: today, total_value: totalValue, total_invest: totalInvest, total_pnl: totalPnl });
}


// 전체 그래프 렌더 (통계 탭)
async function renderPortfolioGraph() {
  const snapshots = await sb.get('snapshots', '&order=date.asc');
  const el = document.getElementById('portfolio-graph');
  if (!el) return;

  if (snapshots.length < 2) {
    el.innerHTML = '<div class="empty">데이터가 부족해요<br>매일 접속하면 그래프가 쌓여요</div>';
    return;
  }

  const W = el.offsetWidth || 320;
  const H = 200;
  const pad = { top: 16, right: 16, bottom: 32, left: 56 };
  const vals = snapshots.map(s => s.total_value);
  const min = Math.min(...vals) * 0.995;
  const max = Math.max(...vals) * 1.005;
  const range = max - min || 1;

  const toX = i => pad.left + (i / (vals.length - 1)) * (W - pad.left - pad.right);
  const toY = v => pad.top + (1 - (v - min) / range) * (H - pad.top - pad.bottom);

  const isUp = vals[vals.length - 1] >= vals[0];
  const color = isUp ? '#4caf7d' : '#f06060';

  // SVG로 그리기
  const pathD = vals.map((v, i) => `${i===0?'M':'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const fillD = pathD + ` L${toX(vals.length-1).toFixed(1)},${H-pad.bottom} L${toX(0).toFixed(1)},${H-pad.bottom} Z`;

  // Y축 레이블 (3개)
  const yLabels = [min, (min+max)/2, max].map((v, i) => {
    const y = toY(v);
    return `<text x="${pad.left - 6}" y="${y+4}" text-anchor="end" font-size="10" fill="var(--text3)">${(v/1000000).toFixed(1)}M</text>
            <line x1="${pad.left}" y1="${y}" x2="${W-pad.right}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
  }).join('');

  // X축 레이블 (최대 6개)
  const step = Math.ceil(snapshots.length / 6);
  const xLabels = snapshots.filter((_, i) => i % step === 0 || i === snapshots.length - 1).map(s => {
    const i = snapshots.indexOf(s);
    const label = s.date.slice(5); // MM.DD
    return `<text x="${toX(i).toFixed(1)}" y="${H - pad.bottom + 14}" text-anchor="middle" font-size="10" fill="var(--text3)">${label}</text>`;
  }).join('');

  // 데이터 포인트 (hover 영역)
  const dots = snapshots.map((s, i) => {
    const x = toX(i).toFixed(1), y = toY(s.total_value).toFixed(1);
    return `<circle cx="${x}" cy="${y}" r="3" fill="${color}" opacity="0.8">
      <title>${s.date}\n${fmtNum(s.total_value)}원</title>
    </circle>`;
  }).join('');

  el.innerHTML = `
    <svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="overflow:visible">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${yLabels}
      ${xLabels}
      <path d="${fillD}" fill="url(#chartGrad)"/>
      <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
      ${dots}
    </svg>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-top:6px;padding:0 4px">
      <span>시작 ${fmtNum(vals[0])}원</span>
      <span style="color:${color};font-weight:600">현재 ${fmtNum(vals[vals.length-1])}원</span>
    </div>
  `;
}
