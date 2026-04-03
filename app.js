// ── 데이터 저장소 (localStorage) ──────────────────────────────
const DB = {
  get: (key) => JSON.parse(localStorage.getItem(key) || '[]'),
  set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
};

const getPositions = () => DB.get('positions');
const savePositions = (d) => DB.set('positions', d);
const getWatchlist = () => DB.get('watchlist');
const saveWatchlist = (d) => DB.set('watchlist', d);
const getReviews = () => DB.get('reviews');
const saveReviews = (d) => DB.set('reviews', d);

// ── 종목 코드 매핑 (네이버 금융 6자리 코드) ──────────────────
const SYMBOL_MAP = {
  '대한항공': '003490',
  '삼성SDI': '006400',
  '에코프로머티': '450080',
  '루닛': '328130',
  'POSCO홀딩스': '005490',
  '삼성전자': '005930',
  'SK하이닉스': '000660',
  '카카오': '035720',
  '네이버': '035420',
  '현대차': '005380',
};

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
  const positions = getPositions().filter(p => p.status === 'open');
  if (positions.length === 0) return;

  // 가격 업데이트 표시
  document.getElementById('refresh-btn').textContent = '갱신 중...';
  document.getElementById('refresh-btn').disabled = true;

  let updated = false;
  for (const p of positions) {
    const price = await fetchPrice(p.name);
    if (price) {
      const all = getPositions();
      const idx = all.findIndex(x => x.id === p.id);
      if (idx !== -1) { all[idx].currentPrice = price; savePositions(all); updated = true; }
    }
  }

  document.getElementById('refresh-btn').textContent = '현재가 갱신';
  document.getElementById('refresh-btn').disabled = false;
  if (updated) renderPortfolio();
}

// ── 초기 샘플 데이터 ──────────────────────────────────────────
function initSampleData() {
  if (getPositions().length > 0) return;
  savePositions([
    {
      id: 1, name: '대한항공', type: 'core', dir: 'buy',
      entry: 23928, qty: 130, target: 31000, stopTrigger: 'LCC 점유율 급등 / 합병 부채 감당 불가',
      thesis: '아시아나 합병 완료 → 국내 항공 사실상 독점 → pricing power 장기 확보',
      conviction: 3, emotion: 'cold', currentPrice: 23000,
      date: '2026-03-29', status: 'open'
    },
    {
      id: 2, name: '삼성SDI', type: 'core', dir: 'buy',
      entry: 413000, qty: 3, target: null, stopTrigger: '전고체 개발 경쟁 도태 / 중국 CATL 압도',
      thesis: '2차전지 중장기 수요 · 전고체 배터리 상용화 기대',
      conviction: 3, emotion: 'cold', currentPrice: 397500,
      date: '2026-03-29', status: 'open'
    },
    {
      id: 3, name: '에코프로머티', type: 'core', dir: 'buy',
      entry: 71810, qty: 15, target: null, stopTrigger: '',
      thesis: '이승석 추천 · 양극재 소재 공급망 국산화 수혜',
      conviction: 2, emotion: 'cold', currentPrice: 70146,
      date: '2026-03-29', status: 'open'
    },
    {
      id: 4, name: '루닛', type: 'trade', dir: 'buy',
      entry: 35368, qty: 34, target: null, stopTrigger: '32,000 이탈 시 즉시 손절',
      thesis: '딥러닝 진단 기술 투자 확대 기대 · 단기 모멘텀',
      conviction: 2, emotion: 'cold', currentPrice: 33100,
      date: '2026-03-29', status: 'open'
    },
  ]);
  saveWatchlist([
    {
      id: 1, name: 'POSCO홀딩스', targetEntry: 280000, currentPrice: 308000,
      thesis: '2차전지 소재 수직계열화 · 리튬 자원 보유. 300,000 저항선 돌파 후 눌림 재진입',
      conditions: ['현재가 308,000 — 목표 진입가 미달', '거래량 평균 이상 확인 필요', '섹터 thesis 유효 (2차전지)'],
      condStatus: [false, false, true], date: '2026-03-29'
    },
  ]);
}

// ── 유틸 ──────────────────────────────────────────────────────
function fmtNum(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Math.round(n).toLocaleString('ko-KR');
}
function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
function calcPnlPct(entry, current) { return ((current - entry) / entry) * 100; }
function calcPnlAmt(entry, current, qty) { return (current - entry) * qty; }
function pnlClass(n) { return n >= 0 ? 'pos' : 'neg'; }
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0');
}
function uid() { return Date.now() + Math.floor(Math.random()*1000); }

// ── 탭 전환 ───────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'entry') renderEntryForm();
  });
});

// ── 보유 포지션 렌더 ──────────────────────────────────────────
function renderPortfolio() {
  const positions = getPositions().filter(p => p.status === 'open');

  // 요약
  let totalInvest = 0, totalPnl = 0, posCount = 0, negCount = 0;
  positions.forEach(p => {
    const invest = p.entry * p.qty;
    const pnl = calcPnlAmt(p.entry, p.currentPrice, p.qty);
    totalInvest += invest;
    totalPnl += pnl;
    if (pnl >= 0) posCount++; else negCount++;
  });
  const totalPct = totalInvest > 0 ? (totalPnl / totalInvest) * 100 : 0;

  document.getElementById('summary-grid').innerHTML = `
    <div class="metric"><div class="metric-label">총 평가손익</div>
      <div class="metric-val ${pnlClass(totalPnl)}">${fmtNum(totalPnl)}원</div></div>
    <div class="metric"><div class="metric-label">수익률</div>
      <div class="metric-val ${pnlClass(totalPct)}">${fmtPct(totalPct)}</div></div>
    <div class="metric"><div class="metric-label">수익 종목</div>
      <div class="metric-val pos">${posCount}</div></div>
    <div class="metric" style="position:relative"><div class="metric-label">손실 종목</div>
      <div class="metric-val ${negCount > 0 ? 'neg' : 'neutral'}">${negCount}</div>
      <button id="refresh-btn" onclick="refreshAllPrices()" style="position:absolute;top:10px;right:10px;background:var(--purple-bg);color:var(--purple);border:none;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer">현재가 갱신</button>
    </div>
  `;

  // 카드 목록
  const listEl = document.getElementById('portfolio-list');
  if (positions.length === 0) {
    listEl.innerHTML = '<div class="empty">보유 포지션 없음<br>+ 신규 매매 버튼으로 추가하세요</div>';
    return;
  }

  listEl.innerHTML = positions.map(p => {
    const pnlPct = calcPnlPct(p.entry, p.currentPrice);
    const pnlAmt = calcPnlAmt(p.entry, p.currentPrice, p.qty);
    const badge = p.type === 'core' ? 'badge-core' : 'badge-trade';
    const badgeText = p.type === 'core' ? '코어' : '트레이딩';
    const triggerClass = p.stopTrigger ? 'trigger-line' : 'trigger-line warn';
    const triggerText = p.stopTrigger || '⚠ 손절 트리거 미설정';
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
          <div class="pos-meta-item">현재가 <span>${fmtNum(p.currentPrice)}</span></div>
          <div class="pos-meta-item">목표가 <span>${p.target ? fmtNum(p.target) : '—'}</span></div>
          <div class="pos-meta-item">확신도 <span>${p.conviction}/5</span></div>
        </div>
        <div class="thesis-box">${p.thesis}</div>
        <div class="${triggerClass}">${triggerText}</div>
      </div>
    `;
  }).join('');
}

// ── 포지션 상세 모달 ──────────────────────────────────────────
function openPositionDetail(id) {
  const p = getPositions().find(x => x.id === id);
  if (!p) return;
  const pnlPct = calcPnlPct(p.entry, p.currentPrice);
  const pnlAmt = calcPnlAmt(p.entry, p.currentPrice, p.qty);

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-title">${p.name} 포지션 상세</div>
    <div class="pos-meta" style="margin-bottom:12px">
      <div class="pos-meta-item">수익률 <span class="${pnlClass(pnlPct)}">${fmtPct(pnlPct)}</span></div>
      <div class="pos-meta-item">평가손익 <span class="${pnlClass(pnlAmt)}">${fmtNum(pnlAmt)}원</span></div>
    </div>
    <div class="divider"></div>
    <div class="form-label">현재가 업데이트</div>
    <input class="form-input" type="number" id="detail-price" value="${p.currentPrice}" placeholder="현재가 입력">
    <div class="form-label" style="margin-top:8px">thesis</div>
    <textarea class="form-input" id="detail-thesis">${p.thesis}</textarea>
    <div class="form-label">손절 트리거</div>
    <textarea class="form-input" id="detail-trigger">${p.stopTrigger}</textarea>
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="submit-btn submit-buy" style="flex:2" onclick="updatePosition(${id})">저장</button>
      <button class="submit-btn" style="flex:1;background:var(--red-bg);color:var(--red)" onclick="closePosition(${id})">매도 완료</button>
    </div>
    <div class="divider"></div>
    <button class="submit-btn" style="background:transparent;color:var(--text3);border:1px solid var(--border);margin-top:0" onclick="deletePosition(${id})">포지션 삭제 (기록 제거)</button>
  `;
  openModal();
}

function updatePosition(id) {
  const positions = getPositions();
  const idx = positions.findIndex(p => p.id === id);
  if (idx === -1) return;
  positions[idx].currentPrice = parseFloat(document.getElementById('detail-price').value) || positions[idx].currentPrice;
  positions[idx].thesis = document.getElementById('detail-thesis').value;
  positions[idx].stopTrigger = document.getElementById('detail-trigger').value;
  savePositions(positions);
  closeModal();
  renderPortfolio();
}

function deletePosition(id) {
  if (!confirm('이 포지션을 완전히 삭제할까요? 복기 기록으로 이동하지 않고 사라집니다.')) return;
  const positions = getPositions().filter(p => p.id !== id);
  savePositions(positions);
  closeModal();
  renderPortfolio();
}

function closePosition(id) {
  const positions = getPositions();
  const idx = positions.findIndex(p => p.id === id);
  if (idx === -1) return;
  const p = positions[idx];
  const exitPrice = parseFloat(document.getElementById('detail-price').value) || p.currentPrice;

  // 복기로 이동
  const reviews = getReviews();
  reviews.push({
    id: uid(), name: p.name, type: p.type,
    entry: p.entry, exit: exitPrice, qty: p.qty,
    thesis: p.thesis, entryDate: p.date, exitDate: todayStr(),
    pnlPct: calcPnlPct(p.entry, exitPrice),
    pnlAmt: calcPnlAmt(p.entry, exitPrice, p.qty),
    whatHappened: '', learned: '', thesisBroke: ''
  });
  saveReviews(reviews);

  positions[idx].status = 'closed';
  savePositions(positions);
  closeModal();
  renderPortfolio();
  renderReview();
}

// ── 관심 종목 렌더 ────────────────────────────────────────────
function renderWatchlist() {
  const list = getWatchlist();
  const el = document.getElementById('watchlist-list');
  if (list.length === 0) {
    el.innerHTML = '<div class="empty">관심 종목 없음<br>+ 버튼으로 추가하세요</div>';
    return;
  }
  el.innerHTML = list.map(w => {
    const diff = w.currentPrice && w.targetEntry
      ? ((w.currentPrice - w.targetEntry) / w.targetEntry * 100).toFixed(1)
      : null;
    const conds = (w.conditions || []).map((c, i) => `
      <div class="cond-row">
        <div class="cond-dot ${w.condStatus[i] ? 'ok' : 'pending'}"></div>
        <span>${c}</span>
      </div>`).join('');
    return `
      <div class="watch-card" onclick="openWatchDetail(${w.id})">
        <div class="pos-card-top">
          <div>
            <div class="pos-name">${w.name} <span class="badge badge-watch">대기</span></div>
            <div class="pos-sub">목표 진입가 ${fmtNum(w.targetEntry)}원</div>
          </div>
          <div class="pos-pnl">
            <div class="pos-pnl-pct ${diff !== null && parseFloat(diff) <= 0 ? 'pos' : 'neg'}">${diff !== null ? diff + '%' : '—'}</div>
            <div class="pos-pnl-amt" style="color:var(--text3)">현재 ${fmtNum(w.currentPrice)}</div>
          </div>
        </div>
        <div class="thesis-box">${w.thesis}</div>
        ${conds}
      </div>
    `;
  }).join('');
}

function openWatchModal() {
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-title">관심 종목 추가</div>
    <div class="form-label">종목명</div>
    <input class="form-input" id="w-name" placeholder="종목명">
    <div class="form-label">목표 진입가</div>
    <input class="form-input" type="number" id="w-target" placeholder="280,000">
    <div class="form-label">현재가</div>
    <input class="form-input" type="number" id="w-current" placeholder="308,000">
    <div class="form-label">투자 thesis</div>
    <textarea class="form-input" id="w-thesis" placeholder="왜 이 종목에 관심을 갖는지..."></textarea>
    <div class="form-label">진입 조건 (한 줄씩, 엔터로 구분)</div>
    <textarea class="form-input" id="w-conds" placeholder="목표가 도달&#10;거래량 평균 이상&#10;섹터 thesis 유효"></textarea>
    <button class="submit-btn submit-watch" onclick="addWatch()">관심 종목 저장</button>
  `;
  openModal();
}

function addWatch() {
  const name = document.getElementById('w-name').value.trim();
  if (!name) return;
  const conds = document.getElementById('w-conds').value.split('\n').filter(c => c.trim());
  const list = getWatchlist();
  list.push({
    id: uid(), name,
    targetEntry: parseFloat(document.getElementById('w-target').value) || null,
    currentPrice: parseFloat(document.getElementById('w-current').value) || null,
    thesis: document.getElementById('w-thesis').value.trim(),
    conditions: conds, condStatus: conds.map(() => false),
    date: todayStr()
  });
  saveWatchlist(list);
  closeModal();
  renderWatchlist();
}

function openWatchDetail(id) {
  const list = getWatchlist();
  const idx = list.findIndex(w => w.id === id);
  if (idx === -1) return;
  const w = list[idx];
  const condRows = (w.conditions || []).map((c, i) => `
    <div class="cond-row" style="cursor:pointer" onclick="toggleCond(${id},${i})">
      <div class="cond-dot ${w.condStatus[i] ? 'ok' : 'pending'}"></div>
      <span>${c}</span>
    </div>`).join('');
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-title">${w.name} 관심 종목</div>
    <div class="form-label">조건 충족 여부 (탭해서 토글)</div>
    ${condRows}
    <div class="divider"></div>
    <div class="form-label">현재가 업데이트</div>
    <input class="form-input" type="number" id="wd-price" value="${w.currentPrice || ''}">
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="submit-btn submit-watch" style="flex:2" onclick="updateWatch(${id})">저장</button>
      <button class="submit-btn submit-buy" style="flex:1" onclick="convertToPosition(${id})">매수 진입</button>
    </div>
    <div class="divider"></div>
    <button class="submit-btn" style="background:transparent;color:var(--text3);border:1px solid var(--border);margin-top:0" onclick="deleteWatch(${id})">관심 종목 삭제</button>
  `;
  openModal();
}

function toggleCond(wid, ci) {
  const list = getWatchlist();
  const idx = list.findIndex(w => w.id === wid);
  if (idx === -1) return;
  list[idx].condStatus[ci] = !list[idx].condStatus[ci];
  saveWatchlist(list);
  openWatchDetail(wid);
}

function updateWatch(id) {
  const list = getWatchlist();
  const idx = list.findIndex(w => w.id === id);
  if (idx === -1) return;
  list[idx].currentPrice = parseFloat(document.getElementById('wd-price').value) || list[idx].currentPrice;
  saveWatchlist(list);
  closeModal();
  renderWatchlist();
}

function deleteWatch(id) {
  if (!confirm('이 관심 종목을 삭제할까요?')) return;
  saveWatchlist(getWatchlist().filter(w => w.id !== id));
  closeModal();
  renderWatchlist();
}

function convertToPosition(id) {
  const list = getWatchlist();
  const w = list.find(x => x.id === id);
  if (!w) return;
  closeModal();
  // 매매 전 체크 탭으로 이동하고 종목명 채워줌
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="entry"]').classList.add('active');
  document.getElementById('tab-entry').classList.add('active');
  renderEntryForm(w.name, w.thesis);
}

// ── 매매 전 체크 폼 ───────────────────────────────────────────
let entryState = {
  dir: 'buy', type: 'core', conv: 3, emo: 'cold'
};

function renderEntryForm(prefillName = '', prefillThesis = '') {
  document.getElementById('entry-form').innerHTML = `
    <div class="form-section">
      <div class="form-label">종목명</div>
      <input class="form-input" id="e-name" placeholder="종목명" value="${prefillName}">
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
      <div class="check-row"><div class="ck ok" id="ck4">✓</div>R/R 확인 (미입력 시 스킵)</div>
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
  const el = document.getElementById(id);
  if (!el) return;
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
  const btn = document.getElementById('e-submit');
  if (!btn) return;
  if (allOk) {
    if (entryState.type === 'watch') {
      btn.className = 'submit-btn submit-watch';
      btn.textContent = '관심 종목으로 저장';
    } else {
      btn.className = 'submit-btn ' + (entryState.dir === 'buy' ? 'submit-buy' : 'submit-sell');
      btn.textContent = (entryState.dir === 'buy' ? '매수' : '매도') + ' 기록 저장 — 이제 주문하세요';
    }
  } else {
    btn.className = 'submit-btn submit-locked';
    btn.textContent = '체크리스트를 완료하세요';
  }
}

function submitEntry() {
  const btn = document.getElementById('e-submit');
  if (!btn || btn.classList.contains('submit-locked')) return;

  const name = document.getElementById('e-name').value.trim();
  if (!name) { alert('종목명을 입력하세요'); return; }

  if (entryState.type === 'watch') {
    const list = getWatchlist();
    const conds = document.getElementById('e-trigger').value.split('\n').filter(c => c.trim());
    list.push({
      id: uid(), name,
      targetEntry: parseFloat(document.getElementById('e-stop').value) || null,
      currentPrice: parseFloat(document.getElementById('e-entry').value) || null,
      thesis: document.getElementById('e-memo').value.trim(),
      conditions: conds.length ? conds : [document.getElementById('e-trigger').value.trim()],
      condStatus: conds.map(() => false), date: todayStr()
    });
    saveWatchlist(list);
    renderWatchlist();
  } else {
    const positions = getPositions();
    positions.push({
      id: uid(), name, type: entryState.type, dir: entryState.dir,
      entry: parseFloat(document.getElementById('e-entry').value) || 0,
      qty: parseInt(document.getElementById('e-qty').value) || 0,
      target: parseFloat(document.getElementById('e-target').value) || null,
      stopTrigger: document.getElementById('e-trigger').value.trim(),
      thesis: document.getElementById('e-memo').value.trim(),
      conviction: entryState.conv, emotion: entryState.emo,
      currentPrice: parseFloat(document.getElementById('e-entry').value) || 0,
      date: todayStr(), status: 'open'
    });
    savePositions(positions);
    renderPortfolio();
  }

  renderEntryForm();
  // 보유 포지션 탭으로 이동
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="portfolio"]').classList.add('active');
  document.getElementById('tab-portfolio').classList.add('active');
}

// ── 복기 탭 ───────────────────────────────────────────────────
function renderReview() {
  const reviews = getReviews();
  const el = document.getElementById('review-list');
  if (!el) return;
  if (reviews.length === 0) {
    el.innerHTML = '<div class="empty">아직 복기할 거래가 없어요<br>매도 완료 후 자동으로 쌓입니다</div>';
    return;
  }
  el.innerHTML = reviews.slice().reverse().map(r => `
    <div class="review-card" onclick="openReviewDetail(${r.id})">
      <div class="pos-card-top">
        <div>
          <div class="pos-name">${r.name} <span class="badge badge-closed">${r.type === 'core' ? '코어' : '트레이딩'}</span></div>
          <div class="pos-sub">${r.entryDate} → ${r.exitDate}</div>
        </div>
        <div class="pos-pnl">
          <div class="review-outcome ${pnlClass(r.pnlPct)}">${fmtPct(r.pnlPct)}</div>
          <div class="pos-pnl-amt ${pnlClass(r.pnlAmt)}">${fmtNum(r.pnlAmt)}원</div>
        </div>
      </div>
      <div class="thesis-box">${r.thesis}</div>
      ${r.learned ? `<div class="review-qa"><div class="review-q">배운 점</div><div class="review-a">${r.learned}</div></div>` : '<div class="trigger-line warn">복기 미작성 — 탭해서 작성하세요</div>'}
    </div>
  `).join('');
}

function openReviewDetail(id) {
  const reviews = getReviews();
  const r = reviews.find(x => x.id === id);
  if (!r) return;
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-title">${r.name} 복기</div>
    <div class="pos-meta" style="margin-bottom:12px">
      <div class="pos-meta-item">진입 <span>${fmtNum(r.entry)}</span></div>
      <div class="pos-meta-item">청산 <span>${fmtNum(r.exit)}</span></div>
      <div class="pos-meta-item">결과 <span class="${pnlClass(r.pnlPct)}">${fmtPct(r.pnlPct)}</span></div>
    </div>
    <div class="divider"></div>
    <div class="form-label">thesis가 깨졌나, 아직 살아있나?</div>
    <div class="toggle-group">
      <button class="toggle-btn ${r.thesisBroke==='alive'?'active-buy':''}" onclick="setReviewField(${id},'thesisBroke','alive',this,'active-buy')">살아있었음</button>
      <button class="toggle-btn ${r.thesisBroke==='broke'?'active-sell':''}" onclick="setReviewField(${id},'thesisBroke','broke',this,'active-sell')">thesis 깨짐</button>
      <button class="toggle-btn ${r.thesisBroke==='early'?'active-warn':''}" onclick="setReviewField(${id},'thesisBroke','early',this,'active-warn')">너무 일찍 청산</button>
    </div>
    <div class="form-label">실제로 어떻게 됐나</div>
    <textarea class="form-input" id="rv-happened" placeholder="예상과 뭐가 달랐나...">${r.whatHappened||''}</textarea>
    <div class="form-label">배운 점</div>
    <textarea class="form-input" id="rv-learned" placeholder="다음에 다르게 할 것...">${r.learned||''}</textarea>
    <div style="display:flex;gap:8px">
      <button class="submit-btn submit-buy" style="flex:2" onclick="saveReviewDetail(${r.id})">복기 저장</button>
      <button class="submit-btn" style="flex:1;background:transparent;color:var(--text3);border:1px solid var(--border)" onclick="deleteReview(${r.id})">삭제</button>
    </div>
  `;
  openModal();
}

function setReviewField(id, field, val, btn, activeClass) {
  const reviews = getReviews();
  const idx = reviews.findIndex(r => r.id === id);
  if (idx === -1) return;
  reviews[idx][field] = val;
  saveReviews(reviews);
  btn.parentElement.querySelectorAll('.toggle-btn').forEach(b => {
    b.className = 'toggle-btn';
  });
  btn.classList.add(activeClass);
}

function saveReviewDetail(id) {
  const reviews = getReviews();
  const idx = reviews.findIndex(r => r.id === id);
  if (idx === -1) return;
  reviews[idx].whatHappened = document.getElementById('rv-happened').value;
  reviews[idx].learned = document.getElementById('rv-learned').value;
  saveReviews(reviews);
  closeModal();
  renderReview();
}

function deleteReview(id) {
  if (!confirm('복기 기록을 삭제할까요?')) return;
  saveReviews(getReviews().filter(r => r.id !== id));
  closeModal();
  renderReview();
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
initSampleData();
renderPortfolio();
renderWatchlist();
renderEntryForm();
renderReview();
