'use strict';

// ─── SERVICE WORKER ───────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ─── CONFIG ───────────────────────────────────────────────────────
const API = window.location.hostname === 'localhost'
    ? 'http://localhost:5000/api'
    : '/api';

const MAX_UPLOAD_FILES = 5;

// ─── STATE ────────────────────────────────────────────────────────
const state = {
    phone:          '',
    gallery:        [],
    folders:        [],
    pickerTarget:   null,
    lightboxIndex:  0,
    uploading:      false,
    currentView:    'timeline',
    deleteFolderId: null,
    currentPage:    1,
    hasMore:        false,
    totalFiles:     0,
    loadingMore:    false,
};

// ─── HELPERS ──────────────────────────────────────────────────────
const $   = id => document.getElementById(id);
const esc = str => encodeURIComponent(str);

const escapeHtml = str =>
    String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

// ─── TOAST ────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    const colors = {
        success: 'text-zinc-200 border-l-emerald-500',
        error:   'text-red-400   border-l-red-500',
        warn:    'text-amber-400 border-l-amber-500',
    };
    const icons = { success: '✓', error: '✕', warn: '⚠' };
    const iconColors = {
        success: 'text-emerald-400',
        error:   'text-red-400',
        warn:    'text-amber-400'
    };

    const div = document.createElement('div');
    div.className = `pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl
        border border-zinc-800 shadow-2xl text-xs font-medium backdrop-blur-md
        transition-all duration-300 -translate-y-3 opacity-0
        bg-zinc-950/95 border-l-2 ${colors[type] || colors.success}`;
    div.innerHTML = `
        <span class="${iconColors[type]} font-bold mt-0.5">${icons[type]}</span>
        <span class="flex-1 leading-relaxed">${msg}</span>`;

    $('toastContainer').appendChild(div);
    requestAnimationFrame(() =>
        requestAnimationFrame(() =>
            div.classList.remove('-translate-y-3', 'opacity-0')
        )
    );
    setTimeout(() => {
        div.classList.add('opacity-0', '-translate-y-3');
        setTimeout(() => div.remove(), 300);
    }, 4000);
}

// ─── API FETCH ────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
    const res  = await fetch(`${API}${path}`, opts);
    const data = await res.json().catch(() => ({}));

    if (res.status === 401 && data.error === 'SESSION_EXPIRED') {
        showToast("Session expired. Logging out…", "error");
        setTimeout(() => {
            localStorage.removeItem('tv_phone');
            location.reload();
        }, 2000);
        throw new Error("SESSION_EXPIRED");
    }

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

// ─── BUTTON LOADING ───────────────────────────────────────────────
function setBtnLoading(btnId, loading, label) {
    const btn = $(btnId);
    if (!btn) return;
    btn.disabled      = loading;
    btn.textContent   = loading ? 'Please wait…' : label;
    btn.style.opacity = loading ? '0.65' : '';
}

// ─── MODAL ────────────────────────────────────────────────────────
function showModal(id) {
    $(id).classList.remove('hidden');
    $(id).classList.add('flex');
}
function hideModal(id) {
    $(id).classList.add('hidden');
    $(id).classList.remove('flex');
}

// ─── AUTH ─────────────────────────────────────────────────────────
function showStep(step) {
    ['stepPhone','stepPassword','stepOtp','stepTwoFA']
        .forEach(id => $(id).classList.add('hidden'));
    const map = {
        phone:    'stepPhone',
        password: 'stepPassword',
        otp:      'stepOtp',
        twofa:    'stepTwoFA'
    };
    if (map[step]) $(map[step]).classList.remove('hidden');
}

async function handlePhoneSubmit() {
    const code   = $('countryCode').value.trim();
    const number = $('phoneInput').value.trim().replace(/\s+/g, '');
    if (!number || number.length < 7)
        return showToast("Enter a valid phone number.", "error");

    state.phone = code + number;
    setBtnLoading('btnPhoneSubmit', true, 'Continue →');
    try {
        const data = await apiFetch('/check-user', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ phoneNumber: state.phone })
        });

        if (data.exists) {
            showStep('password');
            showToast("Account found. Enter your password.");
        } else {
            showToast("New account. Sending OTP via Telegram…");
            await apiFetch('/send-otp', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ phoneNumber: state.phone })
            });
            showStep('otp');
            showToast("OTP sent! Check your Telegram app.");
        }
    } catch (err) {
        if (err.message !== 'SESSION_EXPIRED')
            showToast(err.message, "error");
    } finally {
        setBtnLoading('btnPhoneSubmit', false, 'Continue →');
    }
}

async function handlePasswordLogin() {
    const password = $('loginPasswordInput').value;
    if (!password) return showToast("Password required.", "error");

    setBtnLoading('btnLogin', true, 'Login →');
    try {
        await apiFetch('/login-password', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ phoneNumber: state.phone, password })
        });
        finishLogin();
    } catch (err) {
        if (err.message !== 'SESSION_EXPIRED')
            showToast(err.message, "error");
    } finally {
        setBtnLoading('btnLogin', false, 'Login →');
    }
}

async function handleOtpRegister() {
    const otp      = $('otpInput').value.trim();
    const password = $('regPasswordInput').value;
    if (!otp)                return showToast("Enter the OTP.", "error");
    if (password.length < 6) return showToast("Password must be 6+ characters.", "error");

    setBtnLoading('btnVerifyOtp', true, 'Verify & Register →');
    try {
        const result = await apiFetch('/verify-otp', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ phoneNumber: state.phone, otpCode: otp, password })
        });
        if (result.requires2FA) {
            showStep('twofa');
            showToast("Enter your Telegram 2FA password.", "warn");
        } else {
            finishLogin();
            showToast("Vault initialized! 🎉");
        }
    } catch (err) {
        if (err.message !== 'SESSION_EXPIRED')
            showToast(err.message, "error");
    } finally {
        setBtnLoading('btnVerifyOtp', false, 'Verify & Register →');
    }
}

async function handleTwoFA() {
    const twoFaPassword = $('twoFaInput').value;
    if (!twoFaPassword)
        return showToast("Enter your Telegram 2FA password.", "error");

    setBtnLoading('btnVerify2FA', true, 'Confirm →');
    try {
        await apiFetch('/verify-2fa', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ phoneNumber: state.phone, twoFaPassword })
        });
        finishLogin();
        showToast("Vault initialized! 🎉");
    } catch (err) {
        if (err.message !== 'SESSION_EXPIRED')
            showToast(err.message, "error");
    } finally {
        setBtnLoading('btnVerify2FA', false, 'Confirm →');
    }
}

function finishLogin() {
    localStorage.setItem('tv_phone', state.phone);
    $('authBox').classList.add('hidden');
    $('appDashboard').classList.remove('hidden');
    $('logoutBtn').classList.remove('hidden');
    $('navDock').classList.remove('hidden');
    loadGallery();
    loadFolders();
}

function logout() {
    if (!confirm("Log out of TeleVault?")) return;
    localStorage.removeItem('tv_phone');
    location.reload();
}

// ─── VIEW SWITCH ──────────────────────────────────────────────────
function switchView(view) {
    state.currentView = view;
    const isT = view === 'timeline';

    $('timelineView').classList.toggle('hidden', !isT);
    $('foldersView').classList.toggle('hidden',  isT);
    $('viewTitle').textContent = isT ? 'Timeline' : 'Sub-Vaults';

    const on  = 'p-2.5 rounded-xl transition-all text-white bg-zinc-800 scale-105';
    const off = 'p-2.5 rounded-xl transition-all text-zinc-500 hover:text-zinc-300';
    $('navTimeline').className = isT ? on : off;
    $('navFolders').className  = isT ? off : on;

    if (!isT) loadFolders();
}

function handleSearch() {
    const q = $('searchInput').value.toLowerCase().trim();
    document.querySelectorAll('.gallery-card').forEach(c => {
        c.style.display = (c.dataset.name || '').includes(q) ? '' : 'none';
    });
}

// ─── GALLERY ──────────────────────────────────────────────────────
function renderSkeletons(n = 6) {
    const g = $('galleryGrid');
    g.innerHTML = '';
    for (let i = 0; i < n; i++) {
        const el = document.createElement('div');
        el.className = 'skeleton break-inside-avoid mb-4 h-48';
        g.appendChild(el);
    }
}

async function loadGallery() {
    state.currentPage = 1;
    state.gallery     = [];
    renderSkeletons();
    $('emptyState').classList.add('hidden');
    $('loadMoreContainer').classList.add('hidden');

    try {
        const data = await apiFetch(
            `/gallery?phoneNumber=${esc(state.phone)}&page=1&limit=20`
        );
        state.gallery  = data.files || [];
        state.hasMore  = data.hasMore || false;
        state.totalFiles = data.total || 0;
        renderGallery();
        $('loadMoreContainer').classList.toggle('hidden', !state.hasMore);
    } catch (err) {
        if (err.message !== 'SESSION_EXPIRED')
            showToast("Failed to load gallery.", "error");
        $('galleryGrid').innerHTML = '';
    }
}

async function loadMoreGallery() {
    if (state.loadingMore || !state.hasMore) return;
    state.loadingMore = true;

    const btn = $('loadMoreBtn');
    btn.textContent = 'Loading…';
    btn.disabled    = true;

    try {
        state.currentPage++;
        const data = await apiFetch(
            `/gallery?phoneNumber=${esc(state.phone)}&page=${state.currentPage}&limit=20`
        );
        const newFiles = data.files || [];
        state.gallery  = [...state.gallery, ...newFiles];
        state.hasMore  = data.hasMore || false;

        appendGalleryCards(newFiles, state.gallery.length - newFiles.length);
        $('loadMoreContainer').classList.toggle('hidden', !state.hasMore);
    } catch (err) {
        state.currentPage--;
        if (err.message !== 'SESSION_EXPIRED')
            showToast("Failed to load more.", "error");
    } finally {
        state.loadingMore = false;
        btn.textContent   = 'Load More';
        btn.disabled      = false;
    }
}

function renderGallery(files = state.gallery) {
    const grid = $('galleryGrid');
    grid.innerHTML = '';

    if (!files.length) {
        $('emptyState').classList.remove('hidden');
        $('emptyState').classList.add('flex');
        return;
    }
    $('emptyState').classList.add('hidden');
    $('emptyState').classList.remove('flex');
    files.forEach((file, index) => appendGalleryCards([file], index));
}

function appendGalleryCards(files, startIndex) {
    const grid = $('galleryGrid');

    files.forEach((file, i) => {
        const index    = startIndex + i;
        const mediaUrl = `${API}/image?phone=${esc(state.phone)}&messageId=${file.message_id}`;
        const safeName = escapeHtml(file.file_name);
        const isVideo  = file.file_type === 'video';

        const card = document.createElement('div');
        card.className = [
            'gallery-card relative group break-inside-avoid mb-4 rounded-xl',
            'overflow-hidden border border-zinc-900 bg-zinc-950',
            'transition-all duration-300 hover:border-zinc-700 cursor-zoom-in fade-up'
        ].join(' ');
        card.dataset.name = file.file_name.toLowerCase();

        const mediaEl = isVideo
            ? `<video src="${mediaUrl}" class="w-full h-auto block object-cover pointer-events-none"
                      preload="metadata" muted playsinline></video>
               <div class="absolute top-2 left-2 bg-black/70 text-white text-[10px]
                           font-bold px-1.5 py-0.5 rounded-lg backdrop-blur-sm">▶ VIDEO</div>`
            : `<img src="${mediaUrl}" alt="${safeName}"
                    class="w-full h-auto block object-cover" loading="lazy"
                    onerror="handleImgError(this)">`;

        card.innerHTML = `
            ${mediaEl}
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent
                        to-transparent opacity-0 group-hover:opacity-100
                        transition-all duration-200 flex flex-col justify-between p-3">
                <div class="flex justify-end gap-1.5" onclick="event.stopPropagation()">
                    <button onclick="openFolderPicker('${file.message_id}')"
                            class="bg-zinc-900/90 hover:bg-zinc-700 text-zinc-300 p-2 rounded-lg
                                   backdrop-blur-sm border border-zinc-800 transition-all
                                   active:scale-90" title="Add to folder">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13"
                             viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                            <line x1="12" y1="11" x2="12" y2="17"/>
                            <line x1="9" y1="14" x2="15" y2="14"/>
                        </svg>
                    </button>
                    <button onclick="downloadFile('${mediaUrl}','${safeName}')"
                            class="bg-zinc-900/90 hover:bg-zinc-700 text-white p-2 rounded-lg
                                   backdrop-blur-sm border border-zinc-800 transition-all
                                   active:scale-90" title="Download">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13"
                             viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="2.5" stroke-linecap="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                    </button>
                    <button onclick="deleteFile('${file.message_id}', this)"
                            class="bg-red-950/80 hover:bg-red-900 text-red-400 p-2 rounded-lg
                                   backdrop-blur-sm border border-red-900/40 transition-all
                                   active:scale-90" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13"
                             viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="2.5" stroke-linecap="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
                <div class="text-zinc-300 text-[11px] truncate font-medium bg-black/60
                            px-2 py-1 rounded-lg backdrop-blur-sm border border-zinc-800/40">
                    ${safeName}
                </div>
            </div>`;

        card.addEventListener('click', () => openLightbox(index));
        grid.appendChild(card);
    });
}

function handleImgError(img) {
    const retries = parseInt(img.dataset.retries || '0', 10);
    if (retries < 3) {
        img.dataset.retries = retries + 1;
        setTimeout(() => {
            img.src = img.src.split('&_r=')[0] + `&_r=${Date.now()}`;
        }, 2000 * (retries + 1));
    } else {
        img.closest('.gallery-card').style.opacity = '0.4';
        img.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'
            width='100' height='80'%3E%3Crect fill='%2318181b' width='100'
            height='80'/%3E%3Ctext x='50' y='45' text-anchor='middle'
            fill='%2352525b' font-size='10'%3EFailed%3C/text%3E%3C/svg%3E`;
    }
}

// ─── UPLOAD ───────────────────────────────────────────────────────
function triggerUpload() {
    if (state.uploading) return;
    $('fileSelector').click();
}

function setUploadSpinner(on) {
    $('navUpload').disabled = on;
    $('iconPlus').classList.toggle('hidden', on);
    $('iconSpin').classList.toggle('hidden', !on);
}

$('fileSelector').addEventListener('change', handleFilesSelected);

async function handleFilesSelected() {
    const input = $('fileSelector');
    let files   = Array.from(input.files || []);
    input.value = '';

    if (!files.length || state.uploading) return;

    files = files.filter(f =>
        f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    if (!files.length)
        return showToast("Only images and videos allowed.", "error");

    if (files.length > MAX_UPLOAD_FILES) {
        showToast(`Max ${MAX_UPLOAD_FILES} files. Using first ${MAX_UPLOAD_FILES}.`, "warn");
        files = files.slice(0, MAX_UPLOAD_FILES);
    }

    state.uploading = true;
    setUploadSpinner(true);
    showToast(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}…`);

    let ok = 0;
    for (const file of files) {
        try {
            const processed = file.type.startsWith('image/')
                ? await compressImage(file)
                : file;
            await uploadSingle(processed);
            ok++;
        } catch (err) {
            showToast(`Failed: ${file.name}`, 'error');
        }
    }

    state.uploading = false;
    setUploadSpinner(false);

    if (ok) {
        showToast(`${ok} file${ok > 1 ? 's' : ''} uploaded! ✅`);
        loadGallery();
    }
}

async function compressImage(file) {
    if (file.size <= 512 * 1024) return file;
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload  = e => {
            const img = new Image();
            img.onerror = reject;
            img.onload  = () => {
                const MAX = 1920;
                let w = img.width, h = img.height;
                if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => resolve(
                    new File(
                        [blob],
                        file.name.replace(/\.\w+$/, '.jpg'),
                        { type: 'image/jpeg', lastModified: Date.now() }
                    )
                ), 'image/jpeg', 0.82);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function uploadSingle(file) {
    const fd = new FormData();
    fd.append('phoneNumber', state.phone);
    fd.append('fileName',    file.name);
    fd.append('file',        file);
    const res  = await fetch(`${API}/upload`, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload failed');
}

// ─── DELETE & DOWNLOAD ────────────────────────────────────────────
async function deleteFile(messageId, btn) {
    if (!confirm("Permanently delete this file?")) return;
    try {
        btn.disabled = true;
        await apiFetch('/delete', {
            method:  'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ phone: state.phone, messageId })
        });
        showToast("File deleted.");
        state.gallery = state.gallery.filter(
            f => String(f.message_id) !== String(messageId)
        );
        renderGallery();
    } catch (err) {
        if (err.message !== 'SESSION_EXPIRED')
            showToast(err.message, 'error');
        btn.disabled = false;
    }
}

async function downloadFile(url, filename) {
    try {
        showToast("Preparing download…");
        const blob = await (await fetch(url)).blob();
        const a    = Object.assign(document.createElement('a'), {
            href:     URL.createObjectURL(blob),
            download: filename
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    } catch {
        showToast("Download failed.", "error");
    }
}

// ─── LIGHTBOX ─────────────────────────────────────────────────────
let touchStartX = 0;

function openLightbox(index) {
    const files = state.gallery;
    if (index < 0 || index >= files.length) return;

    state.lightboxIndex = index;
    const file     = files[index];
    const mediaUrl = `${API}/image?phone=${esc(state.phone)}&messageId=${file.message_id}`;
    const isVideo  = file.file_type === 'video';

    const lbImg = $('lbImage');
    const lbVid = $('lbVideo');

    if (isVideo) {
        lbImg.classList.add('hidden');
        lbVid.classList.remove('hidden');
        lbVid.src = mediaUrl;
        lbVid.classList.remove('scale-95');
    } else {
        lbVid.classList.add('hidden');
        lbVid.src = '';
        lbImg.classList.remove('hidden');
        lbImg.src = mediaUrl;
        lbImg.classList.remove('scale-95');
    }

    $('lbTitle').textContent   = file.file_name;
    $('lbCounter').textContent = `${index + 1} / ${files.length}`;
    $('lbDownload').href       = mediaUrl;
    $('lbDownload').download   = file.file_name;

    const lb = $('lightbox');
    lb.classList.remove('hidden');
    lb.classList.add('flex');
    requestAnimationFrame(() =>
        requestAnimationFrame(() =>
            lb.classList.remove('opacity-0')
        )
    );
}

function openFolderPickerFromLightbox() {
    const file = state.gallery[state.lightboxIndex];
    if (file) openFolderPicker(String(file.message_id));
}

function navigateLightbox(dir) {
    let next = state.lightboxIndex + dir;
    if (next < 0) next = state.gallery.length - 1;
    else if (next >= state.gallery.length) next = 0;
    openLightbox(next);
}

function closeLightbox() {
    const lb = $('lightbox');
    lb.classList.add('opacity-0');
    $('lbImage').classList.add('scale-95');
    $('lbVideo').classList.add('scale-95');
    setTimeout(() => {
        lb.classList.add('hidden');
        lb.classList.remove('flex');
        $('lbImage').src = '';
        $('lbVideo').src = '';
        $('lbVideo').classList.add('hidden');
        $('lbImage').classList.remove('hidden');
    }, 280);
}

document.addEventListener('keydown', e => {
    if ($('lightbox').classList.contains('hidden')) return;
    if (e.key === 'Escape')     closeLightbox();
    if (e.key === 'ArrowRight') navigateLightbox(1);
    if (e.key === 'ArrowLeft')  navigateLightbox(-1);
});

$('lightbox').addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

$('lightbox').addEventListener('touchend', e => {
    const delta = e.changedTouches[0].screenX - touchStartX;
    if (Math.abs(delta) > 50) navigateLightbox(delta < 0 ? 1 : -1);
}, { passive: true });

// ─── FOLDERS ──────────────────────────────────────────────────────
async function loadFolders() {
    const grid = $('foldersGrid');
    grid.innerHTML = `
        <div class="col-span-full text-xs text-zinc-700 animate-pulse py-4">
            Loading folders…
        </div>`;
    try {
        const data    = await apiFetch(`/folders?phoneNumber=${esc(state.phone)}`);
        state.folders = data.folders || [];
        renderFolders();
    } catch {
        grid.innerHTML = `
            <div class="text-red-500 text-xs col-span-full">
                Failed to load folders.
            </div>`;
    }
}

function renderFolders() {
    const grid = $('foldersGrid');
    grid.innerHTML = '';

    if (!state.folders.length) {
        grid.innerHTML = `
            <div class="col-span-full text-zinc-700 text-xs py-6 text-center">
                No folders yet. Create one above.
            </div>`;
        return;
    }

    state.folders.forEach(f => {
        const card = document.createElement('div');
        card.className = [
            'relative bg-zinc-950 border border-zinc-900 rounded-2xl p-4',
            'flex flex-col justify-between h-28 hover:border-zinc-700',
            'transition-all duration-300 group shadow-sm fade-up cursor-pointer'
        ].join(' ');

        card.innerHTML = `
            <button onclick="promptDeleteFolder('${f.id}','${escapeHtml(f.name)}',event)"
                    class="absolute top-3 right-3 opacity-0 group-hover:opacity-100
                           transition-all bg-zinc-900 hover:bg-red-950 text-zinc-600
                           hover:text-red-400 p-1.5 rounded-lg border border-zinc-800
                           hover:border-red-900/50 active:scale-90" title="Delete folder">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11"
                     viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2.5" stroke-linecap="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
            </button>
            <div class="text-zinc-600 group-hover:text-zinc-300 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                     viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
            </div>
            <div>
                <h5 class="text-xs font-bold text-zinc-200 group-hover:text-white
                           truncate pr-6">${escapeHtml(f.name)}</h5>
                <p class="text-[10px] text-zinc-600 mt-0.5">
                    ${f.count} item${f.count !== 1 ? 's' : ''}
                </p>
            </div>`;

        card.addEventListener('click', () => openFolderDetail(f.id, f.name));
        grid.appendChild(card);
    });
}

function promptDeleteFolder(folderId, folderName, event) {
    event.stopPropagation();
    state.deleteFolderId = folderId;
    $('confirmDeleteFolderBtn').onclick = () => confirmDeleteFolder(folderId, folderName);
    showModal('modalDeleteFolder');
}

async function confirmDeleteFolder(folderId, folderName) {
    try {
        await apiFetch(`/folders/${folderId}`, {
            method:  'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ phoneNumber: state.phone })
        });
        hideModal('modalDeleteFolder');
        showToast(`Folder "${folderName}" deleted.`);
        loadFolders();
    } catch (err) {
        if (err.message !== 'SESSION_EXPIRED')
            showToast(err.message, "error");
    }
}

async function createFolder() {
    const name = $('newFolderName').value.trim();
    if (!name) return showToast("Enter a folder name.", "error");

    try {
        await apiFetch('/folders', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ phoneNumber: state.phone, name })
        });
        $('newFolderName').value = '';
        hideModal('modalCreateFolder');
        showToast(`"${name}" created.`);
        loadFolders();
    } catch (err) {
        if (err.message !== 'SESSION_EXPIRED')
            showToast(err.message, "error");
    }
}

function openFolderPicker(messageId) {
    state.pickerTarget = messageId;
    const list = $('pickerFolderList');
    list.innerHTML = '';

    if (!state.folders.length) {
        list.innerHTML = `
            <p class="text-[11px] text-zinc-600 px-2 py-3">
                Create a folder first in the Sub-Vaults tab.
            </p>`;
    } else {
        state.folders.forEach(f => {
            const btn = document.createElement('button');
            btn.className = [
                'w-full text-left text-xs text-zinc-300 hover:text-white',
                'hover:bg-zinc-900 p-2.5 rounded-xl transition-all border',
                'border-transparent hover:border-zinc-800 flex items-center justify-between'
            ].join(' ');
            btn.innerHTML = `
                <span>${escapeHtml(f.name)}</span>
                <span class="text-zinc-600 text-[10px]">→</span>`;
            btn.onclick = () => addToFolder(f.id, f.name);
            list.appendChild(btn);
        });
    }
    showModal('modalFolderPicker');
}

async function addToFolder(folderId, folderName) {
    try {
        await apiFetch('/folders/add', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                phoneNumber: state.phone,
                folderId,
                messageId: state.pickerTarget
            })
        });
        hideModal('modalFolderPicker');
        showToast(`Added to "${folderName}".`);
        loadFolders();
    } catch (err) {
        if (err.message !== 'SESSION_EXPIRED')
            showToast(err.message, "error");
    }
}

async function openFolderDetail(folderId, folderName) {
    $('foldersGrid').classList.add('hidden');
    $('folderDetailView').classList.remove('hidden');
    $('folderDetailTitle').textContent = folderName;

    const grid = $('folderDetailGrid');
    grid.innerHTML = `
        <div class="skeleton h-40 break-inside-avoid mb-4"></div>
        <div class="skeleton h-52 break-inside-avoid mb-4"></div>
        <div class="skeleton h-36 break-inside-avoid mb-4"></div>`;

    try {
        const data  = await apiFetch(
            `/folders/images?phoneNumber=${esc(state.phone)}&folderId=${folderId}`
        );
        const files = data.files || [];
        grid.innerHTML = '';

        if (!files.length) {
            grid.innerHTML = `
                <p class="text-zinc-700 text-xs py-6">
                    No items in this folder yet.
                </p>`;
            return;
        }

        files.forEach(file => {
            const mediaUrl = `${API}/image?phone=${esc(state.phone)}&messageId=${file.message_id}`;
            const isVideo  = file.file_type === 'video';
            const card     = document.createElement('div');
            card.className = [
                'relative group break-inside-avoid mb-4 rounded-xl overflow-hidden',
                'border border-zinc-900 bg-zinc-950 transition-all',
                'hover:border-zinc-700 fade-up'
            ].join(' ');

            const mediaEl = isVideo
                ? `<video src="${mediaUrl}" class="w-full h-auto block object-cover"
                          preload="metadata" muted playsinline></video>
                   <div class="absolute top-2 left-2 bg-black/70 text-white text-[10px]
                               font-bold px-1.5 py-0.5 rounded-lg">▶ VIDEO</div>`
                : `<img src="${mediaUrl}" alt="${escapeHtml(file.file_name)}"
                        class="w-full h-auto object-cover block" loading="lazy"
                        onerror="handleImgError(this)">`;

            card.innerHTML = `
                ${mediaEl}
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent
                            to-transparent opacity-0 group-hover:opacity-100
                            transition-all duration-200 flex flex-col justify-between p-3">
                    <div class="flex justify-end" onclick="event.stopPropagation()">
                        <button onclick="removeFromFolder('${folderId}','${file.message_id}','${folderName}')"
                                class="bg-red-950/80 hover:bg-red-900 text-red-400 p-2
                                       rounded-lg border border-red-900/40 transition-all
                                       active:scale-90" title="Remove">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13"
                                 viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 stroke-width="2.5" stroke-linecap="round">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                    <div class="text-zinc-300 text-[11px] truncate font-medium bg-black/60
                                px-2 py-1 rounded-lg border border-zinc-800/40">
                        ${escapeHtml(file.file_name)}
                    </div>
                </div>`;
            grid.appendChild(card);
        });
    } catch (err) {
        grid.innerHTML = `<p class="text-red-500 text-xs">${err.message}</p>`;
    }
}

async function removeFromFolder(folderId, messageId, folderName) {
    if (!confirm("Remove from folder? (File stays in main vault)")) return;
    try {
        await apiFetch('/folders/remove', {
            method:  'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ phoneNumber: state.phone, folderId, messageId })
        });
        showToast("Removed from folder.");
        openFolderDetail(folderId, folderName);
    } catch (err) {
        if (err.message !== 'SESSION_EXPIRED')
            showToast(err.message, "error");
    }
}

function closeFolderDetail() {
    $('folderDetailView').classList.add('hidden');
    $('foldersGrid').classList.remove('hidden');
}

// ─── DRAG & DROP ──────────────────────────────────────────────────
let dragCounter = 0;

document.addEventListener('dragenter', e => {
    e.preventDefault();
    if (!state.phone) return;
    if (++dragCounter === 1) {
        $('dropOverlay').classList.remove('hidden');
        $('dropOverlay').classList.add('flex');
    }
});

document.addEventListener('dragleave', () => {
    if (--dragCounter <= 0) {
        dragCounter = 0;
        $('dropOverlay').classList.add('hidden');
        $('dropOverlay').classList.remove('flex');
    }
});

document.addEventListener('dragover', e => e.preventDefault());

document.addEventListener('drop', e => {
    e.preventDefault();
    dragCounter = 0;
    $('dropOverlay').classList.add('hidden');
    $('dropOverlay').classList.remove('flex');
    if (!state.phone) return;

    let files = Array.from(e.dataTransfer.files).filter(
        f => f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    if (!files.length) return showToast("Only images and videos allowed.", "error");
    if (files.length > MAX_UPLOAD_FILES) {
        showToast(`Max ${MAX_UPLOAD_FILES} files. Using first ${MAX_UPLOAD_FILES}.`, "warn");
        files = files.slice(0, MAX_UPLOAD_FILES);
    }
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    $('fileSelector').files = dt.files;
    handleFilesSelected();
});

// public/app.js — PWA section replace karo
// ─── PWA ──────────────────────────────────────────────────────────
let deferredInstall = null;

// Check if already installed
const isInstalled = window.matchMedia('(display-mode: standalone)').matches ||
                    window.navigator.standalone === true;

if (!isInstalled) {
    // Show install button after 3 sec (dev testing ke liye)
    // Production mein beforeinstallprompt se automatic show hoga
    setTimeout(() => {
        $('installBtn').classList.remove('hidden');
    }, 3000);
}

window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    $('installBtn').classList.remove('hidden');
});

$('installBtn').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === 'accepted') {
        $('installBtn').classList.add('hidden');
    }
    deferredInstall = null;
});

window.addEventListener('appinstalled', () => {
    $('installBtn').classList.add('hidden');
});

// ─── BOOT ─────────────────────────────────────────────────────────
(function init() {
    const saved = localStorage.getItem('tv_phone');
    if (saved) {
        state.phone = saved;
        finishLogin();
    }
})();

// ─── EXPOSE TO GLOBAL SCOPE (for onclick handlers in HTML) ────────
// Without this, onclick="handlePhoneSubmit()" won't find the function
Object.assign(window, {
    // Auth
    handlePhoneSubmit,
    handlePasswordLogin,
    handleOtpRegister,
    handleTwoFA,
    showStep,
    logout,
    // Views
    switchView,
    handleSearch,
    triggerUpload,
    // Gallery
    loadMoreGallery,
    openLightbox,
    closeLightbox,
    navigateLightbox,
    openFolderPickerFromLightbox,
    handleImgError,
    // File actions
    downloadFile,
    deleteFile,
    openFolderPicker,
    // Folders
    createFolder,
    loadFolders,
    openFolderDetail,
    closeFolderDetail,
    removeFromFolder,
    promptDeleteFolder,
    // Modals
    showModal,
    hideModal,
});