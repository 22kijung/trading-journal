// ── Supabase 클라이언트 ────────────────────────────────────────
const SUPABASE_URL = 'https://dpdpwajcgbhswuryphsk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZHB3YWpjZ2Joc3d1cnlwaHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzk4NDksImV4cCI6MjA5MDgxNTg0OX0.FmdmqXwyOKC5hblkZPDgnS35p3q5hsu1-OliunjP_E8';

const sb = {
  async get(table, filter = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?order=created_at.asc${filter}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    return res.ok ? res.json() : [];
  },
  async insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(data)
    });
    return res.ok ? res.json() : null;
  },
  async update(table, id, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(data)
    });
    return res.ok ? res.json() : null;
  },
  async delete(table, id) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
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
    { key: 'kospi',  symbol: '^KS11', label: 'KOSPI' },
    { key: 'kosdaq', symbol: '^KQ11', label: 'KOSDAQ' },
    { key: 'sp500',  symbol: '^GSPC', label: 'S&P 500' },
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
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'entry') renderEntryForm();
    if (btn.dataset.tab === 'review') renderReview();
    if (btn.dataset.tab === 'watchlist') renderWatchlist();
  });
});

// ── 보유 포지션 ───────────────────────────────────────────────
async function renderPortfolio() {
  const [positions, indices] = await Promise.all([
    sb.get('positions', '&status=eq.open'),
    fetchIndices(),
  ]);
  let totalInvest = 0, totalPnl = 0, posCount = 0, negCount = 0;
  positions.forEach(p => {
    const pnl = calcPnlAmt(p.entry, p.current_price, p.qty);
    totalInvest += p.entry * p.qty;
    totalPnl += pnl;
    if (pnl >= 0) posCount++; else negCount++;
  });
  const totalPct = totalInvest > 0 ? (totalPnl / totalInvest) * 100 : 0;
  const totalMarketVal = positions.reduce((s, p) => s + p.current_price * p.qty, 0);

  const pctColor = totalPct >= 0 ? 'var(--green)' : 'var(--red)';

  function idxHtml(key) {
    const d = indices[key];
    if (!d || !d.price) return '<span style="font-size:13px;font-weight:600;color:var(--text2)">—</span>';
    const c = d.change >= 0 ? 'var(--green)' : 'var(--red)';
    const sign = d.change >= 0 ? '+' : '';
    const chg = d.change !== null ? sign + d.change.toFixed(2) + '%' : '';
    return '<span style="font-size:13px;font-weight:600;color:' + c + '">' + d.price.toLocaleString() + ' <span style="font-size:11px">' + chg + '</span></span>';
  }

  document.getElementById('summary-grid').innerHTML = `
    <div class="metric">
      <div class="metric-label">총 평가손익</div>
      <div class="metric-val ${pnlClass(totalPnl)}" style="font-size:20px;font-weight:700;margin-top:6px">${fmtNum(totalPnl)}원</div>
    </div>
    <div class="metric">
      <div class="metric-label">총 수익률</div>
      <div style="font-size:20px;font-weight:700;color:${pctColor};margin-top:6px">${fmtPct(totalPct)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">총 투자금</div>
      <div style="font-size:20px;font-weight:700;color:var(--text);margin-top:6px">${fmtNum(totalInvest)}원</div>
    </div>
    <div class="metric">
      <div class="metric-label">평가금액</div>
      <div style="font-size:20px;font-weight:700;color:var(--text);margin-top:6px">${fmtNum(totalMarketVal)}원</div>
    </div>
    <div class="metric">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div class="metric-label" style="margin-bottom:0">종목 현황</div>
        <button id="refresh-btn" onclick="refreshAllPrices()" style="background:var(--purple-bg);color:var(--purple);border:none;border-radius:6px;padding:3px 8px;font-size:10px;font-weight:600;cursor:pointer">현재가 갱신</button>
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1;border-radius:8px;background:rgba(76,175,125,0.08);padding:10px 12px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px">수익</div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:14px;color:var(--green)">▲</span>
            <span style="font-size:22px;font-weight:700;color:var(--green)">${posCount}</span>
          </div>
        </div>
        <div style="flex:1;border-radius:8px;background:rgba(240,96,96,0.08);padding:10px 12px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px">손실</div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:14px;color:var(--red)">▼</span>
            <span style="font-size:22px;font-weight:700;color:var(--red)">${negCount}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="metric" id="index-section" style="overflow:hidden">
      <div class="metric-label" style="margin-bottom:8px">주요 지수</div>
      <div style="overflow:hidden;height:54px;position:relative">
        <div id="idx-ticker" style="display:flex;flex-direction:column;gap:0;animation:tickerScroll 6s linear infinite">
          <div class="idx-item" style="height:27px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
            <span style="font-size:11px;color:var(--text2)">KOSPI</span>
            <span id="idx-kospi">${idxHtml('kospi')}</span>
          </div>
          <div class="idx-item" style="height:27px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
            <span style="font-size:11px;color:var(--text2)">KOSDAQ</span>
            <span id="idx-kosdaq">${idxHtml('kosdaq')}</span>
          </div>
          <div class="idx-item" style="height:27px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
            <span style="font-size:11px;color:var(--text2)">S&P 500</span>
            <span id="idx-sp500">${idxHtml('sp500')}</span>
          </div>
          <div class="idx-item" style="height:27px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
            <span style="font-size:11px;color:var(--text2)">KOSPI</span>
            <span>${idxHtml('kospi')}</span>
          </div>
          <div class="idx-item" style="height:27px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
            <span style="font-size:11px;color:var(--text2)">KOSDAQ</span>
            <span>${idxHtml('kosdaq')}</span>
          </div>
          <div class="idx-item" style="height:27px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
            <span style="font-size:11px;color:var(--text2)">S&P 500</span>
            <span>${idxHtml('sp500')}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  const listEl = document.getElementById('portfolio-list');
  if (positions.length === 0) {
    listEl.innerHTML = '<div class="empty">보유 포지션 없음<br>+ 신규 매매 버튼으로 추가하세요</div>';
    return;
  }
  listEl.innerHTML = positions.map(p => {
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
          <div class="pos-meta-item">확신도 <span>${p.conviction}/5</span></div>
        </div>
        <div class="thesis-box">${p.thesis || ''}</div>
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
        <input class="form-input" type="number" id="detail-price" value="${p.current_price}" style="margin-bottom:0">
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
  });
  await sb.update('positions', id, { status: 'closed' });
  closeModal(); renderPortfolio(); renderReview();
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
    <input class="form-input" type="number" id="w-target" placeholder="280,000">
    <div class="form-label">현재가</div>
    <input class="form-input" type="number" id="w-current" placeholder="308,000">
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
    <input class="form-input" type="number" id="wd-price" value="${w.current_price || ''}">
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
        <div class="price-cell"><div class="price-cell-label">진입가</div><input type="number" id="e-entry" placeholder="23,800" oninput="calcEntryRR()"></div>
        <div class="price-cell"><div class="price-cell-label" id="e-stop-label">손절가</div><input type="number" id="e-stop" placeholder="22,000" oninput="calcEntryRR()"></div>
        <div class="price-cell"><div class="price-cell-label">목표가</div><input type="number" id="e-target" placeholder="31,000" oninput="calcEntryRR()"></div>
      </div>
      <div class="rr-line">리스크/리워드: <span id="e-rr">—</span></div>
      <div class="form-label">수량</div>
      <input class="form-input" type="number" id="e-qty" placeholder="65">
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

// ── 초기화 ────────────────────────────────────────────────────
document.getElementById('today-date').textContent = todayStr();
renderPortfolio();
renderEntryForm();

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
  ['kospi','kosdaq','sp500'].forEach(key => {
    const cell = document.getElementById('idx-' + key);
    if (!cell) return;
    const d = indices[key];
    if (!d || !d.price) return;
    const c = d.change >= 0 ? 'var(--green)' : 'var(--red)';
    const sign = d.change >= 0 ? '+' : '';
    const chg = d.change !== null ? sign + d.change.toFixed(2) + '%' : '';
    cell.innerHTML = '<span style="font-size:13px;font-weight:600;color:' + c + '">' + d.price.toLocaleString() + ' <span style="font-size:11px">' + chg + '</span></span>';
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
