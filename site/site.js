// The two things on the site that need a script. Without it the page still works: the download buttons
// open the latest release on GitHub, and the waitlist form posts as a plain form.
(() => {
  const zh = document.documentElement.lang === 'zh-Hant';

  // ---------- download: the buttons go straight to the latest release's files, with their sizes ----------
  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
  fetch('https://api.github.com/repos/Zaious/smallol/releases/latest', { headers: { accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((rel) => {
      for (const a of document.querySelectorAll('a[data-file]')) {
        const f = (rel.assets ?? []).find((x) => x.name.endsWith(a.dataset.file));
        if (!f) continue;
        a.href = f.browser_download_url;
        // A file only some releases have (the Mac disk image) shows its button, and its note, once it exists.
        if (a.hasAttribute('data-optional')) {
          a.hidden = false;
          for (const n of document.querySelectorAll(`[data-for="${a.dataset.file}"]`)) n.hidden = false;
        }
        const size = a.querySelector('.size');
        if (size) size.textContent = mb(f.size);
      }
      const ver = document.querySelector('.ver b');
      if (ver && rel.tag_name) ver.textContent = rel.tag_name;
    })
    .catch(() => { /* GitHub unreachable: the buttons still open the release page */ });

  // ---------- the waitlist ----------
  const form = document.getElementById('waitlist-form');
  const msg = document.querySelector('#waitlist .msg');
  if (!form || !msg) return;
  const SAY = zh
    ? { joined: '收到了。推出時會寄一封信給你。', left: '這個 Email 已經刪除。', invalid: 'Email 看起來不太對，再檢查一下。', busy: '同時登記的人太多，請過一分鐘再試。', error: '沒有送出，請稍後再試。' }
    : { joined: "Got it. You'll get an email when it's out.", left: 'That address has been removed.', invalid: "That email doesn't look right.", busy: 'Too many sign-ups at once; try again in a minute.', error: "Couldn't send it; try again later." };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.action = e.submitter?.value === 'leave' ? 'leave' : 'join';
    for (const b of form.querySelectorAll('button')) b.disabled = true;
    let result = 'error';
    try {
      // getAttribute: the buttons are named "action", which hides the form's own .action.
      const r = await fetch(form.getAttribute('action'), { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(data) });
      result = (await r.json()).result ?? 'error';
    } catch { /* stays 'error' */ }
    msg.textContent = SAY[result] ?? SAY.error;
    msg.dataset.result = result;
    for (const b of form.querySelectorAll('button')) b.disabled = false;
    if (result === 'joined' || result === 'left') form.reset();
  });
})();
