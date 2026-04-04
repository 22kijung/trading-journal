// ── Supabase Auth ─────────────────────────────────────────────
const SUPABASE_URL = 'https://dpdpwajcgbhswuryphsk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZHB3YWpjZ2Joc3d1cnlwaHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzk4NDksImV4cCI6MjA5MDgxNTg0OX0.FmdmqXwyOKC5hblkZPDgnS35p3q5hsu1-OliunjP_E8';

const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

async function initAuth() {
  const { data: { session } } = await _sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    showApp();
  } else {
    showLogin();
  }

  _sb.auth.onAuthStateChange((_event, session) => {
    if (session) {
      currentUser = session.user;
      showApp();
    } else {
      currentUser = null;
      showLogin();
    }
  });
}

async function signInWithGoogle() {
  await _sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href }
  });
}

async function signOut() {
  await _sb.auth.signOut();
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.querySelector('.app').style.display = 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.querySelector('.app').style.display = 'block';
  if (typeof initApp === 'function') initApp();
}

async function getAuthHeaders() {
  const { data: { session } } = await _sb.auth.getSession();
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

initAuth();
