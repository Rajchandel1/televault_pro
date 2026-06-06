(function() {

const API = window.location.hostname === 'localhost'
    ? 'http://localhost:5000/api'
    : '/api';

const BOT_USERNAME = 'Clogal_bot';
const MAX_FILES    = 5;

const state = {
    userId: '', userName: '', gallery: [], folders: [],
    pickerTarget: null, lightboxIndex: 0, uploading: false,
    currentView: 'timeline', currentPage: 1, hasMore: false, loadingMore: false,
};

const $ = id => document.getElementById(id);
const esc = str => encodeURIComponent(str);
const escapeHtml = str => String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

// ── TOAST ──────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    const c = { success:'border-l-emerald-500 text-zinc-200', error:'border-l-red-500 text-red-400', warn:'border-l-amber-500 text-amber-400' };
    const i = { success:'✓', error:'✕', warn:'⚠' };
    const ic = { success:'text-emerald-400', error:'text-red-400', warn:'text-amber-400' };
    const div = document.createElement('div');
    div.className = `pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border border-zinc-800 shadow-2xl text-xs font-medium backdrop-blur-md transition-all duration-300 -translate-y-3 opacity-0 bg-zinc-950/95 border-l-2 ${c[type]}`;
    div.innerHTML = `<span class="${ic[type]} font-bold mt-0.5">${i[type]}</span><span class="flex-1 leading-relaxed">${msg}</span>`;
    $('toastContainer').appendChild(div);
    requestAnimationFrame(() => requestAnimationFrame(() => div.classList.remove('-translate-y-3','opacity-0')));
    setTimeout(() => { div.classList.add('opacity-0','-translate-y-3'); setTimeout(() => div.remove(), 300); }, 3500);
}

// ── API ────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
    const res = await fetch(`${API}${path}`, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

function setBtnLoading(id, loading, label) {
    const btn = $(id); if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? 'Please wait…' : label;
    btn.style.opacity = loading ? '0.65' : '';
}

function showModal(id) { $(id).classList.remove('hidden'); $(id).classList.add('flex'); }
function hideModal(id) { $(id).classList.add('hidden'); $(id).classList.remove('flex'); }

// ── CONFIRM MODAL ──────────────────────────────────────────────────
function confirmAction(title, text, onConfirm) {
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;
    $('btnConfirmAction').onclick = () => { hideModal('modalConfirm'); onConfirm(); };
    showModal('modalConfirm');
}

// ── AUTH ───────────────────────────────────────────────────────────
function showStep(step) {
    ['stepRegister','stepLogin','stepConnect','stepChannelSetup']
        .forEach(id => $(id).classList.add('hidden'));
    const map = { register:'stepRegister', login:'stepLogin', connect:'stepConnect', channelSetup:'stepChannelSetup' };
    if (map[step]) $(map[step]).classList.remove('hidden');
 $('appFooter').classList.remove('hidden');
}

async function handleRegister() {
    const name = $('nameInput').value.trim();
    const pw   = $('regPassword').value;
    if (!name || name.length < 2) return showToast("Enter your name.", "error");
    if (pw.length < 6) return showToast("Password must be 6+ characters.", "error");

    setBtnLoading('btnRegister', true, 'Get Started →');
    try {
        const data = await apiFetch('/register', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ name, password: pw })
        });
        localStorage.setItem('tv_userId', data.userId);
        localStorage.setItem('tv_userName', data.name);
        state.userId = data.userId; state.userName = data.name;
        showToast(`Welcome, ${data.name}!`);
        setupConnectStep();
        showStep('connect');
    } catch (err) { showToast(err.message, "error"); }
    finally { setBtnLoading('btnRegister', false, 'Get Started →'); }
}

async function handleLogin() {
    const identifier = $('loginIdentifier').value.trim();
    const pw         = $('loginPassword').value;
    if (!identifier || !pw) return showToast("Enter name and password.", "error");

    setBtnLoading('btnLogin', true, 'Login →');
    try {
        const data = await apiFetch('/login', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ identifier, password: pw })
        });
        localStorage.setItem('tv_userId', data.userId);
        localStorage.setItem('tv_userName', data.name);
        state.userId = data.userId; state.userName = data.name;
        showToast("Logged in successfully!");
        if (data.isConnected) finishLogin();
        else { setupConnectStep(); showStep('connect'); }
    } catch (err) { showToast(err.message, "error"); }
    finally { setBtnLoading('btnLogin', false, 'Login →'); }
}

function setupConnectStep() {
    $('connectBotBtn').href = `https://t.me/${BOT_USERNAME}?start=${state.userId}`;
    $('connectBotBtn').addEventListener('click', () => {
        setTimeout(() => $('btnCheckConnection').classList.remove('hidden'), 1000);
    }, { once: true });
}

function copyText(text) {
    navigator.clipboard.writeText(text)
        .then(() => showToast("Copied!"))
        .catch(() => showToast("Copy failed.", "warn"));
}

async function checkConnectionStatus() {
    try {
        const data = await apiFetch(`/connection-status?userId=${esc(state.userId)}`);
        if (data.isConnected) {
            showToast("Connected successfully!");
            finishLogin();
        } else {
            showToast("Not connected yet. Please complete bot setup.", "warn");
        }
    } catch (err) { showToast(err.message, "error"); }
}

async function handleSetupVault() {
    const input = $('channelInput').value.trim();
    if (!input) return showToast("Paste your channel ID.", "error");

    setBtnLoading('btnSetupVault', true, 'Connect My Channel →');
    try {
        await apiFetch('/set-channel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: state.userId, channelId: input })
        });
        showToast("Channel connected successfully!");
        finishLogin();
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        setBtnLoading('btnSetupVault', false, 'Connect My Channel →');
    }
}

function finishLogin() {
    $('authBox').classList.add('hidden');
    $('appDashboard').classList.remove('hidden');
    $('settingsBtn').classList.remove('hidden');
    $('navDock').classList.remove('hidden');
    $('appFooter').classList.remove('hidden'); 
    loadGallery(); loadFolders();
}

// ── SETTINGS ───────────────────────────────────────────────────────
async function openSettings() {
    showModal('modalSettings');
    try {
        const data = await apiFetch(`/me?userId=${esc(state.userId)}`);
        $('settingsName').textContent = data.name;
        $('settingsVault').textContent = data.userId.slice(0, 8) + '••••••••';
        $('settingsCreated').textContent = new Date(data.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        $('settingsStatus').innerHTML = data.isConnected
            ? `<span class="w-2 h-2 rounded-full bg-emerald-500"></span> Connected`
            : `<span class="w-2 h-2 rounded-full bg-red-500"></span> Not Connected`;
    } catch (err) { showToast("Failed to load settings.", "error"); }
}

function promptLogout() {
    hideModal('modalSettings');
    confirmAction("Logout?", "You'll need to login again to access your vault.", () => {
        localStorage.removeItem('tv_userId');
        localStorage.removeItem('tv_userName');
        location.reload();
    });
}

// ── VIEW ───────────────────────────────────────────────────────────
function switchView(view) {
    const isT = view === 'timeline'; state.currentView = view;
    $('timelineView').classList.toggle('hidden', !isT);
    $('foldersView').classList.toggle('hidden', isT);
    $('viewTitle').textContent = isT ? 'Timeline' : 'Sub-Vaults';
    const on = 'p-2.5 rounded-xl transition-all text-white bg-zinc-800 scale-105';
    const off = 'p-2.5 rounded-xl transition-all text-zinc-500 hover:text-zinc-300';
    $('navTimeline').className = isT ? on : off;
    $('navFolders').className = isT ? off : on;
    if (!isT) loadFolders();
}

function handleSearch() {
    const q = $('searchInput').value.toLowerCase().trim();
    document.querySelectorAll('.gallery-card').forEach(c => {
        c.style.display = (c.dataset.name || '').includes(q) ? '' : 'none';
    });
}

// ── GALLERY ────────────────────────────────────────────────────────
function renderSkeletons(n = 6) {
    const g = $('galleryGrid'); g.innerHTML = '';
    for (let i = 0; i < n; i++) {
        const el = document.createElement('div');
        el.className = 'skeleton break-inside-avoid mb-4 h-48';
        g.appendChild(el);
    }
}

async function loadGallery() {
    state.currentPage = 1; state.gallery = [];
    renderSkeletons();
    $('emptyState').classList.add('hidden');
    $('loadMoreContainer').classList.add('hidden');
    try {
        const data = await apiFetch(`/gallery?userId=${esc(state.userId)}&page=1&limit=20`);
        state.gallery = data.files || [];
        state.hasMore = data.hasMore || false;
        renderGallery();
        $('loadMoreContainer').classList.toggle('hidden', !state.hasMore);
    } catch { showToast("Failed to load.", "error"); $('galleryGrid').innerHTML = ''; }
}

async function loadMoreGallery() {
    if (state.loadingMore || !state.hasMore) return;
    state.loadingMore = true;
    const btn = $('loadMoreBtn'); btn.textContent = 'Loading…'; btn.disabled = true;
    try {
        state.currentPage++;
        const data = await apiFetch(`/gallery?userId=${esc(state.userId)}&page=${state.currentPage}&limit=20`);
        const nf = data.files || [];
        state.gallery = [...state.gallery, ...nf]; state.hasMore = data.hasMore || false;
        appendGalleryCards(nf, state.gallery.length - nf.length);
        $('loadMoreContainer').classList.toggle('hidden', !state.hasMore);
    } catch { state.currentPage--; showToast("Failed.", "error"); }
    finally { state.loadingMore = false; btn.textContent = 'Load More'; btn.disabled = false; }
}

function renderGallery(files = state.gallery) {
    const grid = $('galleryGrid'); grid.innerHTML = '';
    if (!files.length) { $('emptyState').classList.remove('hidden'); $('emptyState').classList.add('flex'); return; }
    $('emptyState').classList.add('hidden'); $('emptyState').classList.remove('flex');
    files.forEach((f, i) => appendGalleryCards([f], i));
}

function appendGalleryCards(files, startIndex) {
    const grid = $('galleryGrid'); const toLoad = [];
    files.forEach((file, i) => {
        const idx = startIndex + i;
        const url = `${API}/image?userId=${esc(state.userId)}&messageId=${file.message_id}`;
        const name = escapeHtml(file.file_name);
        const isVid = file.file_type === 'video';
        const card = document.createElement('div');
        card.className = 'gallery-card relative group break-inside-avoid mb-4 rounded-xl overflow-hidden border border-zinc-900 bg-zinc-950 transition-all duration-300 hover:border-zinc-700 cursor-zoom-in fade-up';
        card.dataset.name = file.file_name.toLowerCase();
        card.innerHTML = `
            <div class="media-placeholder skeleton w-full h-48"></div>
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-between p-3">
                <div class="flex justify-end gap-1.5" onclick="event.stopPropagation()">
                    <button onclick="openFolderPicker('${file.message_id}')" class="bg-zinc-900/90 hover:bg-zinc-700 text-zinc-300 p-2 rounded-lg backdrop-blur-sm border border-zinc-800 transition-all"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg></button>
                    <button onclick="downloadFile('${url}','${name}')" class="bg-zinc-900/90 hover:bg-zinc-700 text-white p-2 rounded-lg backdrop-blur-sm border border-zinc-800 transition-all"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
                    <button onclick="promptDelete('${file.message_id}', this)" class="bg-red-950/80 hover:bg-red-900 text-red-400 p-2 rounded-lg backdrop-blur-sm border border-red-900/40 transition-all"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                </div>
                <div class="text-zinc-300 text-[11px] truncate font-medium bg-black/60 px-2 py-1 rounded-lg backdrop-blur-sm border border-zinc-800/40">${name}</div>
            </div>`;
        card.addEventListener('click', () => openLightbox(idx));
        grid.appendChild(card);
        toLoad.push({ card, mediaUrl: url, isVideo: isVid, safeName: name });
    });
    loadMediaSequentially(toLoad);
}

async function loadMediaSequentially(items) {
    for (const { card, mediaUrl, isVideo, safeName } of items) {
        const ph = card.querySelector('.media-placeholder');
        await new Promise(resolve => {
            if (isVideo) {
                const vid = document.createElement('video');
                vid.className = 'w-full h-auto block object-cover pointer-events-none';
                vid.muted = true; vid.playsInline = true; vid.preload = 'metadata';
                vid.onloadeddata = () => { ph?.remove(); resolve(); };
                vid.onerror = () => resolve();
                vid.src = mediaUrl; card.prepend(vid);
                const b = document.createElement('div');
                b.className = 'absolute top-2 left-2 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-lg z-10';
                b.textContent = '▶ VIDEO'; card.appendChild(b);
            } else {
                const img = document.createElement('img');
                img.className = 'w-full h-auto block object-cover'; img.alt = safeName;
                img.onload = () => { ph?.remove(); resolve(); };
                img.onerror = () => { handleImgError(img); resolve(); };
                img.src = mediaUrl; card.prepend(img);
            }
        });
        await new Promise(r => setTimeout(r, 200));
    }
}

function handleImgError(img) {
    const r = parseInt(img.dataset.retries || '0', 10);
    if (r < 3) { img.dataset.retries = r+1; setTimeout(() => { img.src = img.src.split('&_r=')[0]+`&_r=${Date.now()}`; }, 2000*(r+1)); }
    else { img.closest('.gallery-card').style.opacity = '0.4'; }
}

// ── UPLOAD ─────────────────────────────────────────────────────────
function triggerUpload() { if (!state.uploading) $('fileSelector').click(); }
function setUploadSpinner(on) {
    $('navUpload').disabled = on;
    $('iconPlus').classList.toggle('hidden', on);
    $('iconSpin').classList.toggle('hidden', !on);
}

$('fileSelector').addEventListener('change', handleFilesSelected);
async function handleFilesSelected() {
    const input = $('fileSelector'); let files = Array.from(input.files || []); input.value = '';
    if (!files.length || state.uploading) return;
    files = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (!files.length) return showToast("Only images and videos.", "error");
    if (files.length > MAX_FILES) { showToast(`Max ${MAX_FILES} files.`, "warn"); files = files.slice(0, MAX_FILES); }
    state.uploading = true; setUploadSpinner(true);
    showToast(`Uploading ${files.length} file${files.length>1?'s':''}…`);
    let ok = 0;
    for (const file of files) {
        try { const f = file.type.startsWith('image/') ? await compressImage(file) : file; await uploadSingle(f); ok++; }
        catch (err) { showToast(`Upload failed.`, 'error'); }
    }
    state.uploading = false; setUploadSpinner(false);
    if (ok) { showToast(`${ok} file${ok>1?'s':''} uploaded!`); loadGallery(); }
}

async function compressImage(file) {
    if (file.size <= 512*1024) return file;
    return new Promise((res, rej) => {
        const r = new FileReader(); r.onerror = rej;
        r.onload = e => {
            const img = new Image(); img.onerror = rej;
            img.onload = () => {
                const M = 1920; let w = img.width, h = img.height;
                if (w > M) { h = Math.round(h*M/w); w = M; }
                const c = document.createElement('canvas'); c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, w, h);
                c.toBlob(b => res(new File([b], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() })), 'image/jpeg', 0.82);
            };
            img.src = e.target.result;
        };
        r.readAsDataURL(file);
    });
}

async function uploadSingle(file) {
    const fd = new FormData();
    fd.append('userId', state.userId); fd.append('fileName', file.name); fd.append('file', file);
    const res = await fetch(`${API}/upload`, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload failed');
}

// ── DELETE & DOWNLOAD ──────────────────────────────────────────────
function promptDelete(messageId, btn) {
    confirmAction("Delete File?", "This will permanently remove the file from your vault.", () => deleteFile(messageId, btn));
}

async function deleteFile(messageId, btn) {
    try {
        btn.disabled = true;
        await apiFetch('/delete', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ userId: state.userId, messageId }) });
        showToast("File deleted.");
        state.gallery = state.gallery.filter(f => String(f.message_id) !== String(messageId));
        renderGallery();
    } catch (err) { showToast("Delete failed.", 'error'); btn.disabled = false; }
}

async function downloadFile(url, filename) {
    try {
        showToast("Preparing download…");
        const blob = await (await fetch(url)).blob();
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    } catch { showToast("Download failed.", "error"); }
}

// ── LIGHTBOX ───────────────────────────────────────────────────────
let touchStartX = 0;
function openLightbox(index) {
    if (index < 0 || index >= state.gallery.length) return;
    state.lightboxIndex = index;
    const file = state.gallery[index];
    const url = `${API}/image?userId=${esc(state.userId)}&messageId=${file.message_id}`;
    const isVid = file.file_type === 'video';
    const li = $('lbImage'), lv = $('lbVideo');
    if (isVid) { li.classList.add('hidden'); lv.classList.remove('hidden'); lv.src = url; lv.classList.remove('scale-95'); }
    else { lv.classList.add('hidden'); lv.src = ''; li.classList.remove('hidden'); li.src = url; li.classList.remove('scale-95'); }
    $('lbTitle').textContent = file.file_name;
    $('lbCounter').textContent = `${index+1} / ${state.gallery.length}`;
    $('lbDownload').href = url; $('lbDownload').download = file.file_name;
    const lb = $('lightbox'); lb.classList.remove('hidden'); lb.classList.add('flex');
    requestAnimationFrame(() => requestAnimationFrame(() => lb.classList.remove('opacity-0')));
}
function openFolderPickerFromLightbox() { const f = state.gallery[state.lightboxIndex]; if (f) openFolderPicker(String(f.message_id)); }
function navigateLightbox(dir) { let n = state.lightboxIndex + dir; if (n < 0) n = state.gallery.length-1; else if (n >= state.gallery.length) n = 0; openLightbox(n); }
function closeLightbox() {
    const lb = $('lightbox'); lb.classList.add('opacity-0');
    $('lbImage').classList.add('scale-95'); $('lbVideo').classList.add('scale-95');
    setTimeout(() => { lb.classList.add('hidden'); lb.classList.remove('flex'); $('lbImage').src = ''; $('lbVideo').src = ''; $('lbVideo').classList.add('hidden'); $('lbImage').classList.remove('hidden'); }, 280);
}
document.addEventListener('keydown', e => {
    if ($('lightbox').classList.contains('hidden')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') navigateLightbox(1);
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
});
$('lightbox').addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
$('lightbox').addEventListener('touchend', e => { const d = e.changedTouches[0].screenX - touchStartX; if (Math.abs(d) > 50) navigateLightbox(d<0?1:-1); }, { passive: true });

// ── FOLDERS ────────────────────────────────────────────────────────
async function loadFolders() {
    const g = $('foldersGrid');
    g.innerHTML = `<div class="col-span-full text-xs text-zinc-700 animate-pulse py-4">Loading…</div>`;
    try { const data = await apiFetch(`/folders?userId=${esc(state.userId)}`); state.folders = data.folders || []; renderFolders(); }
    catch { g.innerHTML = `<div class="text-red-500 text-xs col-span-full">Failed.</div>`; }
}
function renderFolders() {
    const g = $('foldersGrid'); g.innerHTML = '';
    if (!state.folders.length) { g.innerHTML = `<div class="col-span-full text-zinc-700 text-xs py-6 text-center">No folders yet.</div>`; return; }
    state.folders.forEach(f => {
        const card = document.createElement('div');
        card.className = 'relative bg-zinc-950 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between h-28 hover:border-zinc-700 transition-all group shadow-sm fade-up cursor-pointer';
        card.innerHTML = `
            <button onclick="promptDeleteFolder('${f.id}','${escapeHtml(f.name)}',event)" class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all bg-zinc-900 hover:bg-red-950 text-zinc-600 hover:text-red-400 p-1.5 rounded-lg border border-zinc-800"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            <div class="text-zinc-600 group-hover:text-zinc-300 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
            <div><h5 class="text-xs font-bold text-zinc-200 group-hover:text-white truncate pr-6">${escapeHtml(f.name)}</h5><p class="text-[10px] text-zinc-600 mt-0.5">${f.count} item${f.count!==1?'s':''}</p></div>`;
        card.addEventListener('click', () => openFolderDetail(f.id, f.name));
        g.appendChild(card);
    });
}

function promptDeleteFolder(id, name, e) {
    e.stopPropagation();
    confirmAction("Delete Folder?", `"${name}" will be removed. Your files stay safe in the vault.`, async () => {
        try {
            await apiFetch(`/folders/${id}`, { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId:state.userId}) });
            showToast("Folder deleted."); loadFolders();
        } catch (err) { showToast("Delete failed.", "error"); }
    });
}

async function createFolder() {
    const name = $('newFolderName').value.trim(); if (!name) return showToast("Enter a name.", "error");
    try {
        await apiFetch('/folders', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId:state.userId,name}) });
        $('newFolderName').value = ''; hideModal('modalCreateFolder');
        showToast("Folder created."); loadFolders();
    } catch { showToast("Create failed.", "error"); }
}

function openFolderPicker(msgId) {
    state.pickerTarget = msgId; const list = $('pickerFolderList'); list.innerHTML = '';
    if (!state.folders.length) { list.innerHTML = `<p class="text-[11px] text-zinc-600 px-2 py-3">Create a folder first.</p>`; }
    else {
        state.folders.forEach(f => {
            const btn = document.createElement('button');
            btn.className = 'w-full text-left text-xs text-zinc-300 hover:text-white hover:bg-zinc-900 p-2.5 rounded-xl transition-all border border-transparent hover:border-zinc-800 flex items-center justify-between';
            btn.innerHTML = `<span>${escapeHtml(f.name)}</span><span class="text-zinc-600 text-[10px]">→</span>`;
            btn.onclick = () => addToFolder(f.id, f.name);
            list.appendChild(btn);
        });
    }
    showModal('modalFolderPicker');
}

async function addToFolder(fId, fName) {
    try {
        await apiFetch('/folders/add', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId:state.userId,folderId:fId,messageId:state.pickerTarget}) });
        hideModal('modalFolderPicker');
        showToast("Added to folder."); loadFolders();
    } catch { showToast("Add failed.", "error"); }
}

async function openFolderDetail(fId, fName) {
    $('foldersGrid').classList.add('hidden'); $('folderDetailView').classList.remove('hidden');
    $('folderDetailTitle').textContent = fName;
    const grid = $('folderDetailGrid');
    grid.innerHTML = `<div class="skeleton h-40 break-inside-avoid mb-4"></div><div class="skeleton h-52 break-inside-avoid mb-4"></div>`;
    try {
        const data = await apiFetch(`/folders/images?userId=${esc(state.userId)}&folderId=${fId}`);
        const files = data.files || []; grid.innerHTML = '';
        if (!files.length) { grid.innerHTML = `<p class="text-zinc-700 text-xs py-6">No items yet.</p>`; return; }
        const toLoad = [];
        files.forEach(file => {
            const url = `${API}/image?userId=${esc(state.userId)}&messageId=${file.message_id}`;
            const isVid = file.file_type === 'video';
            const card = document.createElement('div');
            card.className = 'relative group break-inside-avoid mb-4 rounded-xl overflow-hidden border border-zinc-900 bg-zinc-950 transition-all hover:border-zinc-700 fade-up';
            card.innerHTML = `
                <div class="media-placeholder skeleton w-full h-48"></div>
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-between p-3">
                    <div class="flex justify-end" onclick="event.stopPropagation()">
                        <button onclick="promptRemoveFromFolder('${fId}','${file.message_id}','${fName}')" class="bg-red-950/80 hover:bg-red-900 text-red-400 p-2 rounded-lg border border-red-900/40 transition-all"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                    </div>
                    <div class="text-zinc-300 text-[11px] truncate font-medium bg-black/60 px-2 py-1 rounded-lg border border-zinc-800/40">${escapeHtml(file.file_name)}</div>
                </div>`;
            grid.appendChild(card);
            toLoad.push({ card, mediaUrl: url, isVideo: isVid, safeName: file.file_name });
        });
        loadMediaSequentially(toLoad);
    } catch { grid.innerHTML = `<p class="text-red-500 text-xs">Failed.</p>`; }
}

function promptRemoveFromFolder(fId, msgId, fName) {
    confirmAction("Remove from folder?", "The file stays in your main vault.", async () => {
        try {
            await apiFetch('/folders/remove', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId:state.userId,folderId:fId,messageId:msgId}) });
            showToast("Removed."); openFolderDetail(fId, fName);
        } catch { showToast("Remove failed.", "error"); }
    });
}

function closeFolderDetail() { $('folderDetailView').classList.add('hidden'); $('foldersGrid').classList.remove('hidden'); }

// ── DRAG & DROP ────────────────────────────────────────────────────
let dragCounter = 0;
document.addEventListener('dragenter', e => { e.preventDefault(); if (!state.userId) return; if (++dragCounter===1) { $('dropOverlay').classList.remove('hidden'); $('dropOverlay').classList.add('flex'); } });
document.addEventListener('dragleave', () => { if (--dragCounter<=0) { dragCounter=0; $('dropOverlay').classList.add('hidden'); $('dropOverlay').classList.remove('flex'); } });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
    e.preventDefault(); dragCounter=0; $('dropOverlay').classList.add('hidden'); $('dropOverlay').classList.remove('flex');
    if (!state.userId) return;
    let files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (!files.length) return showToast("Only images and videos.", "error");
    if (files.length > MAX_FILES) { files = files.slice(0, MAX_FILES); showToast(`Max ${MAX_FILES}.`, "warn"); }
    const dt = new DataTransfer(); files.forEach(f => dt.items.add(f));
    $('fileSelector').files = dt.files; handleFilesSelected();
});

// ── PWA INSTALL ────────────────────────────────────────────────────
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferredInstall = e;
    $('installBtn').classList.remove('hidden');
});
$('installBtn').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === 'accepted') $('installBtn').classList.add('hidden');
    deferredInstall = null;
});
window.addEventListener('appinstalled', () => $('installBtn').classList.add('hidden'));

// ── EXPOSE ─────────────────────────────────────────────────────────
Object.assign(window, {
    handleRegister, handleLogin, showStep, openSettings, promptLogout,
    checkConnectionStatus, copyText, handleSetupVault,
    switchView, handleSearch, triggerUpload,
    loadMoreGallery, openLightbox, closeLightbox, navigateLightbox,
    openFolderPickerFromLightbox, handleImgError,
    downloadFile, promptDelete, openFolderPicker,
    createFolder, openFolderDetail, closeFolderDetail,
    promptDeleteFolder, promptRemoveFromFolder,
    showModal, hideModal,
});

// ── BOOT ───────────────────────────────────────────────────────────
const savedId = localStorage.getItem('tv_userId');
const savedName = localStorage.getItem('tv_userName');
if (savedId && savedName) {
    state.userId = savedId; state.userName = savedName;
    apiFetch(`/connection-status?userId=${esc(savedId)}`)
        .then(data => { if (data.isConnected) finishLogin(); else { setupConnectStep(); showStep('connect'); $('authBox').classList.remove('hidden'); } })
        .catch(() => { localStorage.removeItem('tv_userId'); localStorage.removeItem('tv_userName'); });
} else { showStep('register'); }
$('appFooter').classList.remove('hidden');
})();