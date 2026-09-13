/* Main-site Clock Out board. Uses Deal Daily's existing authenticated client. */
(() => {
  'use strict';
  const box = document.getElementById('clockout-board');
  if (!box) return;
  const q = s => box.querySelector(s);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dollars = n => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
  const snapshotKey = 'clockout.leaderboard.snapshot.v1';
  let request = 0, busy = false, available = false;
  let calculator = null, calculationRaw = null;
  // Import in module scope to share the exact economy without starting a game.
  async function calculateSavedWorth() {
    try {
      const raw = localStorage.getItem('clockout.v2');
      if (!raw || raw === calculationRaw) return;
      calculationRaw = raw;
      calculator ||= import('./grind.js');
      await calculator;
      if(localStorage.getItem('clockout.v2') !== raw) {calculateSavedWorth();return;}
      const summary = window.clockoutReadWorth(JSON.parse(raw));
      try {localStorage.setItem(snapshotKey,JSON.stringify(summary));} catch {}
      localSummary();
    } catch {}
  }
  function snapshot() {
    try {
      const s = JSON.parse(localStorage.getItem(snapshotKey));
      if (!s || s.version !== 1 || !Number.isFinite(s.netWorth) || s.netWorth < 0 || s.netWorth > 1e15 || !Number.isInteger(s.generation) || s.generation < 1 || s.generation > 1e6 || !Number.isFinite(s.savedAt)) return null;
      // Never publish a cached summary after a different save has been imported/reset.
      const save = JSON.parse(localStorage.getItem('clockout.v2'));
      return save && save.last === s.savedAt ? s : null;
    } catch { return null; }
  }
  function localSummary() {
    const s = snapshot();
    if (!s) calculateSavedWorth();
    q('#nw-local-worth').textContent = s ? dollars(s.netWorth) : 'Start your story';
    q('#nw-local-detail').textContent = s ? `Generation ${s.generation} · saved ${new Date(s.savedAt).toLocaleString()}` : 'Open Clock Out to refresh your saved net worth.';
    q('#nw-submit').disabled = busy || !available || !sb || !user || !s;
    q('#nw-name').disabled = busy || !user;
    q('#nw-auth-note').textContent = user ? 'Your chosen name, net worth and generation will be public when you post.' : 'Log in at the top of the page to post your net worth.';
  }
  function row(entry, rank) {
    const mine = user && entry.user_id === user.id;
    return `<tr${mine?' class="me"':''}><td class="nw-rank">${rank}</td><th scope="row">${escape(entry.name)}${mine?' <span class="tag good">you</span>':''}</th><td class="num">${dollars(Number(entry.net_worth))}</td><td class="num">${entry.generation}</td></tr>`;
  }
  async function refresh() {
    const token = ++request;
    localSummary();
    q('#nw-refresh').disabled = true;
    q('#nw-state').textContent = 'Loading standings…';
    try {
      if (!sb) throw new Error('not-configured');
      const {data, error} = await sb.from('clockout_leaderboard').select('user_id,name,net_worth,generation,updated_at').order('net_worth',{ascending:false}).order('updated_at',{ascending:true}).order('user_id',{ascending:true}).limit(50);
      if (token !== request) return;
      if (error) throw error;
      available = true;
      q('#nw-state').textContent = data.length ? `Top ${data.length} · latest posted net worth · ties share a rank` : 'No entries yet. Build your life, then be the first to post.';
      let rank = 0, previous = null;
      q('#nw-rows').innerHTML = data.map((entry,i) => {if(Number(entry.net_worth)!==previous)rank=i+1;previous=Number(entry.net_worth);return row(entry,rank);}).join('');
      q('#nw-table').hidden = !data.length;
      q('#nw-mine').textContent = '';
      if (user) {
        const id = user.id;
        const {data:mine,error:mineError} = await sb.from('clockout_leaderboard').select('name,net_worth,updated_at').eq('user_id',id).maybeSingle();
        if (token !== request || user?.id !== id) return;
        if (!mineError && mine) {
          q('#nw-mine').textContent = `Your posted score: ${dollars(Number(mine.net_worth))} · ${new Date(mine.updated_at).toLocaleString()}`;
          if (!q('#nw-name').value) q('#nw-name').value = mine.name;
        }
      }
    } catch(error) {
      if (token !== request) return;
      available = false;
      q('#nw-rows').replaceChildren();
      q('#nw-table').hidden = true;
      q('#nw-mine').textContent = '';
      q('#nw-state').textContent = ['PGRST205','42P01'].includes(error.code) ? 'The global board is being set up. Your game progress is still saved on this device.' : 'The global board is unavailable right now. Try refreshing in a moment.';
    } finally {
      if (token === request) {q('#nw-refresh').disabled = false; localSummary();}
    }
  }
  q('#nw-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !available || !sb || !user) return;
    const s = snapshot(), name = q('#nw-name').value.trim();
    if (!s || name.length < 2 || name.length > 24) {q('#nw-message').textContent = 'Choose a name of 2–24 characters and open Clock Out to refresh your save.'; return;}
    busy = true; localSummary(); q('#nw-message').textContent = 'Posting your net worth…';
    try {
      const {error} = await sb.from('clockout_leaderboard').upsert({user_id:user.id,name,net_worth:Number(s.netWorth.toFixed(2)),generation:s.generation},{onConflict:'user_id'});
      if (error) throw error;
      q('#nw-message').textContent = 'Posted! Your latest score replaces your previous entry.';
      await refresh();
    } catch {q('#nw-message').textContent = 'Could not post. Your game save is safe; please try again.';}
    finally {busy = false; localSummary();}
  });
  q('#nw-refresh').addEventListener('click',refresh);
  window.addEventListener('storage',e => {if(e.key===snapshotKey || e.key==='clockout.v2')localSummary();});
  window.addEventListener('focus',localSummary);
  LB_REFRESH.push(refresh);
  refresh();
})();
