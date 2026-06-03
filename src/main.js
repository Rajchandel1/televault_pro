import './style.css'

const BACKEND_URL = "http://localhost:5000/api";
let userPhone = "";
let cachedGalleryFiles = [];
let cachedFolders = [];
let activeAssetTargetMessageId = null;
let currentImageIndex = 0;
let touchStartX = 0;
let touchEndX = 0;

document.querySelector('#app').innerHTML = `
<div id="fileDropOverlay" class="fixed inset-0 bg-black/80 backdrop-blur-lg z-50 hidden flex-col items-center justify-center border-2 border-dashed border-zinc-800 m-6 rounded-3xl pointer-events-none transition-all duration-300">
    <div class="text-3xl mb-3 animate-bounce">✨</div>
    <div class="text-sm font-bold text-white tracking-wide">Drop anywhere to upload to Vault</div>
    <div class="text-zinc-500 text-[11px] mt-1">Decentralized encryption will auto-apply</div>
</div>

<input type="file" id="fileSelector" accept="image/*" class="hidden" onchange="uploadImage()" />

<div id="toastContainer" class="fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"></div>

<div class="max-w-4xl mx-auto space-y-8">
    <header class="flex items-center justify-between border-b border-zinc-900 pb-5 pt-2">
        <div>
            <div class="flex items-center gap-2">
                <h1 class="text-xl font-bold tracking-tight text-white">Gallery</h1>
                <span class="text-[10px] font-bold bg-zinc-900 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-800 uppercase tracking-wider">Pro</span>
            </div>
            <p class="text-zinc-500 text-xs mt-0.5">Unlimited decentralized cloud architecture.</p>
        </div>
        <div class="flex items-center gap-3">
            <button id="logoutBtn" onclick="logout()" class="hidden text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 px-3 py-2 rounded-xl border border-zinc-800/80 transition-all duration-200">Logout</button>
        </div>
    </header>

    <div id="authBox" class="bg-[#09090b] p-6 md:p-8 rounded-2xl border border-zinc-900 shadow-2xl max-w-sm mx-auto mt-16 transition-all duration-300">
        <div id="phoneStep" class="space-y-4">
            <div>
                <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Telegram Phone Number</label>
                <div class="flex gap-2">
                    <input type="text" id="countryCode" value="+91" class="w-20 px-2 py-3 rounded-xl border border-zinc-800 bg-[#121214] text-center font-bold text-zinc-400 text-sm focus:outline-none" />
                    <input type="text" id="phoneInput" placeholder="8769650918" class="flex-1 px-4 py-3 rounded-xl border border-zinc-800 bg-[#121214] outline-none text-sm font-medium tracking-wide text-white focus:border-zinc-700 transition-all placeholder:text-zinc-700">
                </div>
            </div>
            <button id="phoneSubmitBtn" onclick="checkUserFlow()" class="w-full bg-white hover:bg-zinc-200 text-black font-semibold text-sm py-3 rounded-xl transition-all duration-200 shadow-sm active:scale-[0.99]">Continue</button>
            <div id="authStatusMessage" class="text-xs text-zinc-400 mt-3 min-h-[1.2rem]"></div>
        </div>

        <div id="passwordStep" class="space-y-4 hidden">
            <div>
                <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Enter TeleVault Password</label>
                <input type="password" id="loginPasswordInput" placeholder="••••••••" class="w-full px-4 py-3 rounded-xl border border-zinc-800 bg-[#121214] outline-none text-sm text-white focus:border-zinc-700 transition-all placeholder:text-zinc-700">
            </div>
            <button onclick="loginWithPassword()" class="w-full bg-white hover:bg-zinc-200 text-black font-semibold text-sm py-3 rounded-xl transition-all duration-200 active:scale-[0.99]">Login</button>
            <button onclick="resetAuthFlow()" class="w-full text-xs text-zinc-500 hover:text-zinc-300 font-medium transition-all text-center block pt-1">← Change phone number</button>
        </div>

        <div id="otpStep" class="space-y-4 hidden">
            <div class="bg-zinc-900/50 border border-zinc-800 p-3.5 rounded-xl text-xs text-zinc-400 font-medium leading-relaxed">
                New User? Let's initialize your secure drive via official Telegram OTP.
            </div>
            <div>
                <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Telegram OTP</label>
                <input type="text" id="otpInput" placeholder="12345" class="w-full px-4 py-3 rounded-xl border border-zinc-800 bg-[#121214] text-center tracking-[0.5em] font-bold text-base text-white outline-none focus:border-zinc-700 transition-all placeholder:text-zinc-800">
            </div>
            <div>
                <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Create Master Password</label>
                <input type="password" id="regPasswordInput" placeholder="For future secure logins" class="w-full px-4 py-3 rounded-xl border border-zinc-800 bg-[#121214] outline-none text-sm text-white focus:border-zinc-700 transition-all placeholder:text-zinc-700">
            </div>
            <button onclick="verifyOTPAndRegister()" class="w-full bg-white hover:bg-zinc-200 text-black font-semibold text-sm py-3 rounded-xl transition-all duration-200 active:scale-[0.99]">Verify & Register</button>
            <button onclick="resetAuthFlow()" class="w-full text-xs text-zinc-500 hover:text-zinc-300 font-medium transition-all text-center block">← Back</button>
        </div>
    </div>

    <div id="appDashboard" class="hidden space-y-6 transition-all duration-500">
        <div class="space-y-6">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-4">
                <button id="installBtn" class="hidden fixed bottom-24 right-6 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xl z-50">Install App</button>
                <div class="flex items-center gap-2">
                    <h3 id="galleryViewTitle" class="text-xs font-bold text-zinc-500 uppercase tracking-wider">Timeline Feed</h3>
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                </div>
                <div class="relative max-w-xs w-full">
                    <input type="text" id="gallerySearch" oninput="filterGallery()" placeholder="Search vault assets..." class="w-full px-3.5 py-1.5 rounded-xl bg-[#09090b] border border-zinc-900 outline-none text-xs text-white focus:border-zinc-700 transition-all placeholder:text-zinc-600">
                </div>
            </div>
            <div id="timelineContainer" class="block">
                <div id="galleryGrid" class="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4"></div>
            </div>
            <div id="foldersContainer" class="hidden space-y-6 animate-fade-in">
                <div class="flex justify-between items-center">
                    <div class="text-xs text-zinc-500 font-semibold tracking-wide uppercase">Secured Sub-Vaults</div>
                    <button onclick="toggleModal('createFolderModal', true)" class="text-xs bg-zinc-900 hover:bg-zinc-800 text-zinc-200 px-3 py-1.5 border border-zinc-800 rounded-xl transition-all font-medium flex items-center gap-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Create Folder
                    </button>
                </div>
                <div id="foldersGrid" class="grid grid-cols-2 sm:grid-cols-3 gap-4"></div>
                <div id="innerFolderView" class="hidden space-y-4 border-t border-zinc-900 pt-6">
                    <div class="flex items-center justify-between">
                        <button onclick="exitFolderView()" class="text-xs font-semibold text-zinc-400 hover:text-white flex items-center gap-1"><span>← Close</span></button>
                        <h2 id="innerFolderTitle" class="text-sm font-bold text-white tracking-wide"></h2>
                    </div>
                    <div id="folderInnerGrid" class="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4"></div>
                </div>
            </div>
            <div id="emptyState" class="hidden flex flex-col items-center justify-center text-center py-32 animate-fade-in">
                <div class="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xl mb-4 shadow-sm">📦</div>
                <h3 class="text-sm font-bold text-zinc-200 tracking-wide">Your Vault is Empty</h3>
                <p class="text-zinc-500 text-xs mt-1 max-w-[240px] leading-relaxed">No decentralized assets detected in your current Telegram stream setup.</p>
                <button onclick="document.getElementById('fileSelector').click()" class="mt-5 bg-white hover:bg-zinc-200 text-black text-xs font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 active:scale-95 shadow-md flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Upload Your First Image
                </button>
            </div>
        </div>
    </div>
</div>

<div id="navDock" class="hidden fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/80 px-5 py-2.5 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.7)] flex items-center gap-6 z-40 transition-all duration-300">
    <button id="tabTimeline" onclick="toggleViewMode('timeline')" class="text-white bg-zinc-800 p-2.5 rounded-xl transition-all scale-105">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
    </button>
    <button id="navUploadBtn" onclick="document.getElementById('fileSelector').click()" class="bg-white hover:bg-zinc-200 text-black p-2.5 rounded-xl transition-all duration-200 hover:scale-110 active:scale-95 shadow-md font-bold">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    </button>
    <button id="tabFolders" onclick="toggleViewMode('folders')" class="text-zinc-500 hover:text-zinc-300 p-2.5 rounded-xl transition-all">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
    </button>
</div>

<div id="createFolderModal" class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 hidden flex items-center justify-center p-4" onclick="toggleModal('createFolderModal', false)">
    <div class="bg-[#09090b] border border-zinc-900 w-full max-w-xs p-5 rounded-2xl space-y-4" onclick="event.stopPropagation()">
        <div>
            <h4 class="text-sm font-bold text-white">Create Virtual Folder</h4>
            <p class="text-zinc-500 text-[11px] mt-0.5">Organize current Telegram stream arrays.</p>
        </div>
        <input type="text" id="newFolderNameInput" placeholder="e.g., Personal Document Assets" class="w-full px-3.5 py-2 rounded-xl bg-[#121214] border border-zinc-800 text-xs text-white outline-none focus:border-zinc-700 transition-all placeholder:text-zinc-700">
        <div class="flex gap-2">
            <button onclick="toggleModal('createFolderModal', false)" class="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-semibold text-xs py-2.5 rounded-xl transition-all border border-zinc-800/80">Cancel</button>
            <button onclick="submitNewFolder()" class="flex-1 bg-white hover:bg-zinc-200 text-black font-semibold text-xs py-2.5 rounded-xl transition-all">Confirm</button>
        </div>
    </div>
</div>

<div id="folderPickerModal" class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 hidden flex items-center justify-center p-4" onclick="toggleModal('folderPickerModal', false)">
    <div class="bg-[#09090b] border border-zinc-900 w-full max-w-xs p-5 rounded-2xl space-y-4" onclick="event.stopPropagation()">
        <div>
            <h4 class="text-sm font-bold text-white">Map to Workspace</h4>
            <p class="text-zinc-500 text-[11px] mt-0.5">Select cluster destination for encryption link.</p>
        </div>
        <div id="pickerFoldersList" class="space-y-1 max-h-48 overflow-y-auto pr-1"></div>
        <button onclick="toggleModal('folderPickerModal', false)" class="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-semibold text-xs py-2.5 rounded-xl transition-all border border-zinc-800">Close</button>
    </div>
</div>

<div id="lightbox" class="fixed inset-0 bg-black/90 backdrop-blur-lg hidden z-50 flex flex-col items-center justify-center p-4 transition-all duration-300 opacity-0 select-none" onclick="closeLightbox()">
    <div class="absolute top-4 right-4 flex items-center gap-2" onclick="event.stopPropagation()">
        <a id="lightboxDownload" href="#" download class="bg-zinc-900 hover:bg-zinc-800 text-white p-2.5 rounded-xl border border-zinc-800 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        </a>
        <button onclick="closeLightbox()" class="bg-zinc-900 hover:bg-zinc-800 text-white p-2.5 rounded-xl border border-zinc-800 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="17"></line></svg>
        </button>
    </div>
    <button onclick="navigateLightbox(-1); event.stopPropagation();" class="hidden md:block absolute left-6 top-1/2 -translate-y-1/2 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-white p-3.5 rounded-xl border border-zinc-800/80 transition-all backdrop-blur-md shadow-2xl active:scale-95">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
    </button>
    <img id="lightboxImg" class="max-w-full max-h-[78vh] md:max-h-[82vh] rounded-2xl object-contain shadow-2xl transition-all duration-200 scale-95 pointer-events-none" onclick="event.stopPropagation()" />
    <button onclick="navigateLightbox(1); event.stopPropagation();" class="hidden md:block absolute right-6 top-1/2 -translate-y-1/2 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-white p-3.5 rounded-xl border border-zinc-800/80 transition-all backdrop-blur-md shadow-2xl active:scale-95">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
    </button>
    <div id="lightboxTitle" class="mt-4 text-zinc-400 text-xs font-medium tracking-wide bg-zinc-900/80 px-3 py-2 rounded-xl backdrop-blur-md border border-zinc-800 truncate max-w-[85vw] md:max-w-md"></div>
</div>
`;

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
}

function showToast(text, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-xl shadow-2xl border text-xs font-medium backdrop-blur-md transition-all duration-300 -translate-y-4 opacity-0 pointer-events-auto flex items-center justify-between gap-4 border-l-4`;
    if (type === 'error') {
        toast.className += ' bg-[#09090b]/90 text-red-400 border-zinc-800 border-l-2 border-l-red-500';
    } else {
        toast.className += ' bg-[#09090b]/90 text-zinc-200 border-zinc-800 border-l-2 border-l-white';
    }
    toast.innerHTML = `<span>${text}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('-translate-y-4', 'opacity-0'), 50);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-[-10px]');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function setAuthStatus(text, type = 'info') {
    const el = document.getElementById('authStatusMessage');
    if (!el) return;
    el.innerText = text;
    el.className = `text-xs mt-3 min-h-[1.2rem] ${type === 'error' ? 'text-red-400' : 'text-zinc-400'}`;
}

function setupCountryCodeInput() {
    const countryCodeInput = document.getElementById('countryCode');
    if (!countryCodeInput) return;

    const sanitizeValue = (value) => {
        let sanitized = value.replace(/[^0-9+]/g, '');
        if (!sanitized.startsWith('+')) sanitized = `+${sanitized.replace(/\++/g, '')}`;
        if (sanitized === '') sanitized = '+';
        if (sanitized.startsWith('+') && sanitized.length > 1) {
            sanitized = `+${sanitized.slice(1).replace(/\+/g, '')}`;
        }
        return sanitized;
    };

    countryCodeInput.addEventListener('input', (event) => {
        const current = event.target.value || '';
        const sanitized = sanitizeValue(current);
        if (sanitized !== current) {
            const cursorPosition = countryCodeInput.selectionStart || sanitized.length;
            countryCodeInput.value = sanitized;
            countryCodeInput.setSelectionRange(cursorPosition, cursorPosition);
        }
    });

    countryCodeInput.addEventListener('keydown', (event) => {
        const cursorPos = countryCodeInput.selectionStart;
        if ((event.key === 'Backspace' || event.key === 'Delete') && cursorPos === 1) {
            event.preventDefault();
        }
    });
}

function setPhoneStepLoading(isLoading) {
    const submitBtn = document.getElementById('phoneSubmitBtn');
    const phoneInput = document.getElementById('phoneInput');
    if (!submitBtn || !phoneInput) return;
    submitBtn.disabled = isLoading;
    phoneInput.disabled = isLoading;
    submitBtn.innerText = isLoading ? 'Sending OTP…' : 'Continue';
}

function getCleanPhone(phone) {
    if (!phone) return "";
    let clean = phone.trim().replace(/\s+/g, '');
    if (!clean.startsWith('+')) clean = '+' + clean;
    return clean;
}

function setupDragAndDrop() {
    const overlay = document.getElementById('fileDropOverlay');
    const fileInput = document.getElementById('fileSelector');
    if (!overlay || !fileInput) return;

    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (!userPhone) return;
        overlay.classList.remove('hidden');
    });
    window.addEventListener('dragover', (e) => { e.preventDefault(); });
    overlay.addEventListener('dragleave', (e) => { e.preventDefault(); overlay.classList.add('hidden'); });
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        overlay.classList.add('hidden');
        if (!userPhone) return;
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) {
            fileInput.files = files;
            uploadImage();
        }
    });
}

function setupMobileSwipeGestures() {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox) return;
    lightbox.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
    lightbox.addEventListener('touchend', (e) => { touchEndX = e.changedTouches[0].screenX; handleSwipeLogic(); }, { passive: true });
}

function handleSwipeLogic() {
    const swipeThreshold = 60;
    const deltaX = touchEndX - touchStartX;
    if (Math.abs(deltaX) > swipeThreshold) {
        if (deltaX < 0) navigateLightbox(1);
        else navigateLightbox(-1);
    }
}

function toggleModal(modalId, show) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}

function toggleViewMode(mode) {
    const timeline = document.getElementById('timelineContainer');
    const folders = document.getElementById('foldersContainer');
    const tabTimeline = document.getElementById('tabTimeline');
    const tabFolders = document.getElementById('tabFolders');
    const title = document.getElementById('galleryViewTitle');

    if (mode === 'timeline') {
        timeline?.classList.remove('hidden');
        folders?.classList.add('hidden');
        if (title) title.innerText = 'Timeline Feed';
        if (tabTimeline) tabTimeline.className = 'text-white bg-zinc-800 p-2.5 rounded-xl transition-all scale-105';
        if (tabFolders) tabFolders.className = 'text-zinc-500 hover:text-zinc-300 p-2.5 rounded-xl transition-all';
        exitFolderView();
    } else {
        timeline?.classList.add('hidden');
        folders?.classList.remove('hidden');
        if (title) title.innerText = 'Secured Clusters';
        if (tabFolders) tabFolders.className = 'text-white bg-zinc-800 p-2.5 rounded-xl transition-all scale-105';
        if (tabTimeline) tabTimeline.className = 'text-zinc-500 hover:text-zinc-300 p-2.5 rounded-xl transition-all';
        loadFolders();
    }
}

function filterGallery() {
    const query = document.getElementById('gallerySearch').value.toLowerCase().trim();
    const cards = document.querySelectorAll('.gallery-card');
    cards.forEach(card => {
        const fileName = card.getAttribute('data-name') || '';
        card.style.display = fileName.includes(query) ? 'block' : 'none';
    });
}

async function loadFolders() {
    const grid = document.getElementById('foldersGrid');
    if (!grid) return;
    grid.innerHTML = `<div class="text-zinc-600 text-xs animate-pulse">Querying relational clusters...</div>`;
    try {
        const res = await fetch(`${BACKEND_URL}/folders?phoneNumber=${encodeURIComponent(userPhone)}`);
        const data = await res.json();
        cachedFolders = data.folders || [];
        grid.innerHTML = '';
        if (cachedFolders.length === 0) {
            grid.innerHTML = `<div class="text-zinc-700 text-xs py-4 col-span-full">No encrypted sub-vault clusters defined yet.</div>`;
            return;
        }
        cachedFolders.forEach(folder => {
            const card = document.createElement('div');
            card.className = 'bg-[#09090b] border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between group hover:border-zinc-700 transition-all duration-300 cursor-pointer h-28 shadow-sm relative overflow-hidden';
            card.onclick = () => openFolderView(folder.id, folder.name);
            card.innerHTML = `
                <div class="text-zinc-500 group-hover:text-white transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                </div>
                <div>
                    <h5 class="text-xs font-bold text-zinc-200 truncate group-hover:text-white">${folder.name}</h5>
                    <p class="text-[10px] text-zinc-600 font-medium mt-0.5">${folder.count || 0} links tracked</p>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (error) {
        grid.innerHTML = `<div class="text-red-500 text-xs">Failed data mapping parse.</div>`;
    }
}

async function submitNewFolder() {
    const input = document.getElementById('newFolderNameInput');
    const name = input?.value.trim();
    if (!name) return showToast('Folder designation key missing!', 'error');
    showToast('Allocating mapping indices...');
    const res = await fetch(`${BACKEND_URL}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: userPhone, name })
    });
    if (res.ok) {
        showToast(`Drive mapping "${name}" registered.`);
        if (input) input.value = '';
        toggleModal('createFolderModal', false);
        loadFolders();
    } else {
        showToast('Database engine rejected node creation.', 'error');
    }
}

function openFolderPicker(messageId, event) {
    event?.stopPropagation();
    activeAssetTargetMessageId = messageId;
    const container = document.getElementById('pickerFoldersList');
    if (!container) return;
    container.innerHTML = '';
    if (cachedFolders.length === 0) {
        container.innerHTML = `<div class="text-[11px] text-zinc-600 p-2">Create a cluster folder first from the sub-vaults tab!</div>`;
        toggleModal('folderPickerModal', true);
        return;
    }
    cachedFolders.forEach(folder => {
        const btn = document.createElement('button');
        btn.className = 'w-full text-left text-xs text-zinc-300 hover:text-white hover:bg-zinc-900/60 p-2 rounded-xl transition-all border border-transparent hover:border-zinc-800/80 truncate font-medium flex items-center justify-between';
        btn.onclick = () => assignAssetToFolder(folder.id, folder.name);
        btn.innerHTML = `<span>${folder.name}</span> <span class="text-[10px] text-zinc-600">→</span>`;
        container.appendChild(btn);
    });
    toggleModal('folderPickerModal', true);
}

async function assignAssetToFolder(folderId, folderName) {
    showToast(`Generating mapping pointer for ${folderName}...`);
    const res = await fetch(`${BACKEND_URL}/folders/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: userPhone, folderId, messageId: activeAssetTargetMessageId })
    });
    if (res.ok) {
        showToast(`Asset linked securely into "${folderName}"`);
        toggleModal('folderPickerModal', false);
        loadFolders();
    } else {
        showToast('Collision layer or mapping error.', 'error');
    }
}

async function openFolderView(folderId, folderName) {
    const foldersGrid = document.getElementById('foldersGrid');
    if (foldersGrid) foldersGrid.classList.add('hidden');
    const innerView = document.getElementById('innerFolderView');
    if (innerView) innerView.classList.remove('hidden');
    const title = document.getElementById('innerFolderTitle');
    if (title) title.innerText = folderName;
    const subGrid = document.getElementById('folderInnerGrid');
    if (!subGrid) return;
    subGrid.innerHTML = `<div class="text-zinc-600 text-xs p-2 animate-pulse">Syncing encrypted virtual paths...</div>`;
    const encodedPhone = encodeURIComponent(userPhone);
    const res = await fetch(`${BACKEND_URL}/folders/images?phoneNumber=${encodedPhone}&folderId=${folderId}`);
    const data = await res.json();
    subGrid.innerHTML = '';
    if (!data.files || data.files.length === 0) {
        subGrid.innerHTML = `<div class="text-zinc-700 text-xs py-4">No content mapped to this sub-vault workspace node.</div>`;
        return;
    }
    data.files.forEach((file, index) => {
        const card = document.createElement('div');
        card.className = 'relative group break-inside-avoid rounded-xl overflow-hidden border border-zinc-900 bg-[#09090b] transition-all duration-300 hover:shadow-2xl mb-4 cursor-zoom-in';
        const imageUrl = `${BACKEND_URL}/image?phone=${encodedPhone}&messageId=${file.message_id}`;
        card.onclick = () => openLightbox(index);
        card.innerHTML = `
            <img src="${imageUrl}" class="w-full h-auto object-cover block" loading="lazy" />
            <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col justify-between p-3.5">
                <div class="flex justify-end gap-1.5" onclick="event.stopPropagation()">
                    <button onclick="removeAssetFromFolder('${folderId}', '${file.message_id}', '${folderName}')" class="bg-zinc-900/90 hover:bg-red-950/80 text-zinc-400 hover:text-red-400 p-2 rounded-lg backdrop-blur-sm transition-all border border-zinc-800 shadow-sm active:scale-95">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div class="text-zinc-300 text-[11px] truncate font-medium bg-black/60 px-2 py-1 rounded backdrop-blur-md border border-zinc-800/60">${file.file_name}</div>
            </div>
        `;
        subGrid.appendChild(card);
    });
}

async function removeAssetFromFolder(folderId, messageId, folderName) {
    if (!confirm('Unlink this asset pointer from this folder? (Telegram base storage will remain safe)')) return;
    const res = await fetch(`${BACKEND_URL}/folders/remove`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: userPhone, folderId, messageId })
    });
    if (res.ok) {
        showToast('Pointer dropped successfully.');
        openFolderView(folderId, folderName);
    } else {
        showToast('Internal path breaking failed.', 'error');
    }
}

function exitFolderView() {
    const innerView = document.getElementById('innerFolderView');
    const foldersGrid = document.getElementById('foldersGrid');
    if (innerView) innerView.classList.add('hidden');
    if (foldersGrid) foldersGrid.classList.remove('hidden');
}

function openLightbox(index) {
    if (index < 0 || index >= cachedGalleryFiles.length) return;
    currentImageIndex = index;
    const file = cachedGalleryFiles[index];
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxTitle = document.getElementById('lightboxTitle');
    const lightboxDownload = document.getElementById('lightboxDownload');
    const encodedPhone = encodeURIComponent(userPhone);
    const imageUrl = `${BACKEND_URL}/image?phone=${encodedPhone}&messageId=${file.message_id}`;
    if (lightboxImg) lightboxImg.src = imageUrl;
    if (lightboxTitle) lightboxTitle.innerText = file.file_name;
    if (lightboxDownload) {
        lightboxDownload.href = imageUrl;
        lightboxDownload.setAttribute('download', file.file_name);
    }
    if (lightbox && lightbox.classList.contains('hidden')) {
        lightbox.classList.remove('hidden');
        setTimeout(() => {
            lightbox.classList.remove('opacity-0');
            if (lightboxImg) lightboxImg.classList.remove('scale-95');
        }, 50);
    }
}

function navigateLightbox(direction) {
    if (!cachedGalleryFiles.length) return;
    let targetIndex = currentImageIndex + direction;
    if (targetIndex < 0) targetIndex = cachedGalleryFiles.length - 1;
    if (targetIndex >= cachedGalleryFiles.length) targetIndex = 0;
    openLightbox(targetIndex);
}

document.onkeydown = function(evt) {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox || lightbox.classList.contains('hidden')) return;
    if (evt.key === 'Escape') closeLightbox();
    if (evt.key === 'ArrowRight' || evt.key === 'd') navigateLightbox(1);
    if (evt.key === 'ArrowLeft' || evt.key === 'a') navigateLightbox(-1);
};

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    if (!lightbox) return;
    lightbox.classList.add('opacity-0');
    if (lightboxImg) lightboxImg.classList.add('scale-95');
    setTimeout(() => lightbox.classList.add('hidden'), 300);
}

function renderShimmerLoaders() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const shimmer = document.createElement('div');
        shimmer.className = 'animate-pulse break-inside-avoid rounded-xl bg-[#09090b] border border-zinc-900 p-2 space-y-3 mb-4';
        shimmer.innerHTML = `<div class="bg-zinc-900/60 rounded-lg w-full h-48"></div><div class="h-3 bg-zinc-900/60 rounded w-2/3 mx-auto"></div>`;
        grid.appendChild(shimmer);
    }
}

function showDashboard() {
    document.getElementById('authBox')?.classList.add('hidden');
    document.getElementById('appDashboard')?.classList.remove('hidden');
    document.getElementById('logoutBtn')?.classList.remove('hidden');
    document.getElementById('navDock')?.classList.remove('hidden');
}

function resetAuthFlow() {
    document.getElementById('phoneStep')?.classList.remove('hidden');
    document.getElementById('passwordStep')?.classList.add('hidden');
    document.getElementById('otpStep')?.classList.add('hidden');
    setAuthStatus('', 'info');
    setPhoneStepLoading(false);
}

function logout() {
    localStorage.removeItem('televault_phone');
    location.reload();
}

async function checkUserFlow() {
    const code = document.getElementById('countryCode')?.value || '';
    const number = document.getElementById('phoneInput')?.value.trim() || '';
    if (!number || number.length < 10) return showToast('Enter a valid phone number!', 'error');
    userPhone = `${code}${number}`;
    setAuthStatus('Checking number...', 'info');
    document.getElementById('passwordStep')?.classList.add('hidden');
    document.getElementById('otpStep')?.classList.add('hidden');
    setPhoneStepLoading(true);
    try {
        const res = await fetch(`${BACKEND_URL}/check-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: userPhone })
        });
        const data = await res.json();
        if (data.exists) {
            setPhoneStepLoading(false);
            setAuthStatus('Account matched. Enter Master Password.');
            document.getElementById('phoneStep')?.classList.add('hidden');
            document.getElementById('passwordStep')?.classList.remove('hidden');
        } else {
            setAuthStatus('Sending OTP to your Telegram account...', 'info');
            const otpRes = await fetch(`${BACKEND_URL}/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber: userPhone })
            });
            if (!otpRes.ok) throw new Error('OTP send failed');
            setPhoneStepLoading(false);
            setAuthStatus('OTP sent — enter it below along with your password when it arrives.', 'info');
            document.getElementById('phoneStep')?.classList.add('hidden');
            document.getElementById('otpStep')?.classList.remove('hidden');
        }
    } catch (error) {
        setPhoneStepLoading(false);
        setAuthStatus('Unable to send OTP. Try again in a moment.', 'error');
        showToast('Failed to reach the auth server.', 'error');
    }
}

async function loginWithPassword() {
    const password = document.getElementById('loginPasswordInput')?.value || '';
    if (!password) return showToast('Password cannot be blank!', 'error');
    showToast('Decrypting keychains...');
    const res = await fetch(`${BACKEND_URL}/login-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: userPhone, password })
    });
    if (res.ok) {
        localStorage.setItem('televault_phone', userPhone);
        showDashboard();
        loadGallery();
        loadFolders();
        showToast('Vault handshake success!');
    } else {
        const data = await res.json();
        showToast(data.error || 'Authentication failed!', 'error');
    }
}

async function verifyOTPAndRegister() {
    const otpCode = document.getElementById('otpInput')?.value.trim() || '';
    const password = document.getElementById('regPasswordInput')?.value || '';
    if (!otpCode || !password) return showToast('Fill all validation arrays!', 'error');
    showToast('Configuring drive clusters...');
    const res = await fetch(`${BACKEND_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: userPhone, otpCode, password })
    });
    if (res.ok) {
        localStorage.setItem('televault_phone', userPhone);
        showDashboard();
        loadGallery();
        loadFolders();
        showToast('Registration completed securely!');
    } else {
        showToast('Invalid verification parameters.', 'error');
    }
}

async function uploadImage() {
    const fileInput = document.getElementById('fileSelector');
    const navUploadBtn = document.getElementById('navUploadBtn');
    if (!fileInput?.files.length) return;
    const file = fileInput.files[0];
    if (navUploadBtn) {
        navUploadBtn.disabled = true;
        navUploadBtn.innerHTML = `<svg class="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
    }
    const compressImage = (sourceFile) => new Promise(resolve => {
        const reader = new FileReader();
        reader.readAsDataURL(sourceFile);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const MAX_WIDTH = 1920;
                let width = img.width;
                let height = img.height;
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    resolve(new File([blob], sourceFile.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', 0.7);
            };
        };
    });
    try {
        let fileToUpload = file;
        if (file.size > 1024 * 1024) fileToUpload = await compressImage(file);
        const formData = new FormData();
        formData.append('phoneNumber', userPhone);
        formData.append('fileName', fileToUpload.name);
        formData.append('file', fileToUpload);
        const res = await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData });
        if (navUploadBtn) {
            navUploadBtn.disabled = false;
            navUploadBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        }
        if (res.ok) {
            showToast('Uploaded Successfully!');
            if (fileInput) fileInput.value = '';
            loadGallery();
        } else {
            showToast('Pipeline upload error encountered.', 'error');
        }
    } catch (err) {
        if (navUploadBtn) {
            navUploadBtn.disabled = false;
            navUploadBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        }
        showToast('Network pipe allocation error.', 'error');
    }
}

async function loadGallery() {
    renderShimmerLoaders();
    const encodedPhone = encodeURIComponent(userPhone);
    const res = await fetch(`${BACKEND_URL}/gallery?phoneNumber=${encodedPhone}`);
    const data = await res.json();
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (!data.files || data.files.length === 0) {
        cachedGalleryFiles = [];
        document.getElementById('emptyState')?.classList.remove('hidden');
        return;
    }
    document.getElementById('emptyState')?.classList.add('hidden');
    cachedGalleryFiles = data.files;
    cachedGalleryFiles.forEach((file, index) => {
        const card = document.createElement('div');
        card.className = 'gallery-card relative group break-inside-avoid rounded-xl overflow-hidden border border-zinc-900 bg-[#09090b] transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.5)] mb-4 cursor-zoom-in';
        card.setAttribute('data-name', file.file_name.toLowerCase());
        const imageUrl = `${BACKEND_URL}/image?phone=${encodedPhone}&messageId=${file.message_id}`;
        card.onclick = () => openLightbox(index);
        card.innerHTML = `
            <img src="${imageUrl}" class="w-full h-auto object-cover block" loading="lazy" />
            <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col justify-between p-3.5">
                <div class="flex justify-end gap-1.5" onclick="event.stopPropagation()">
                    <button onclick="openFolderPicker('${file.message_id}', event)" class="bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 p-2 rounded-lg backdrop-blur-sm transition-all border border-zinc-800 shadow-sm active:scale-95">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
                    </button>
                    <button onclick="downloadImage('${imageUrl}', '${file.file_name}')" class="bg-zinc-900/90 hover:bg-zinc-800 text-white p-2 rounded-lg backdrop-blur-sm transition-all border border-zinc-800 shadow-sm active:scale-95">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                    <button onclick="deleteImage('${file.message_id}', this)" class="bg-red-950/80 hover:bg-red-900 text-red-400 p-2 rounded-lg backdrop-blur-sm transition-all border border-red-900/50 shadow-sm active:scale-95">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>
                <div class="text-zinc-300 text-[11px] truncate font-medium bg-black/60 px-2 py-1 rounded backdrop-blur-md border border-zinc-800/60">${file.file_name}</div>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function downloadImage(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename || 'download.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
        showToast('Download execution pipeline broke.', 'error');
    }
}

async function deleteImage(messageId, buttonElement) {
    if (!confirm('Are you sure you want to delete this file permanently?')) return;
    try {
        const res = await fetch(`${BACKEND_URL}/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: userPhone, messageId })
        });
        const data = await res.json();
        if (data.success) {
            buttonElement.closest('.gallery-card')?.remove();
            showToast('Item purged from Telegram storage arrays.');
            loadGallery();
        } else {
            showToast('Purge API rejected request: ' + data.error, 'error');
        }
    } catch (err) {
        showToast('Failed to delete network resource.', 'error');
    }
}

function initApp() {
    registerServiceWorker();
    const savedPhone = localStorage.getItem('televault_phone');
    if (savedPhone) {
        userPhone = savedPhone;
        showDashboard();
        loadGallery();
        loadFolders();
    }
    setupDragAndDrop();
    setupCountryCodeInput();
    setupMobileSwipeGestures();
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        window.deferredPrompt = e;
        document.getElementById('installBtn')?.classList.remove('hidden');
    });
    document.getElementById('installBtn')?.addEventListener('click', () => {
        if (window.deferredPrompt) {
            window.deferredPrompt.prompt();
            window.deferredPrompt.userChoice.then(choiceResult => {
                if (choiceResult.outcome === 'accepted') {
                    document.getElementById('installBtn')?.classList.add('hidden');
                }
                window.deferredPrompt = null;
            });
        }
    });
    window.addEventListener('appinstalled', () => {
        document.getElementById('installBtn')?.classList.add('hidden');
    });
}

window.addEventListener('DOMContentLoaded', initApp);

window.checkUserFlow = checkUserFlow;
window.loginWithPassword = loginWithPassword;
window.verifyOTPAndRegister = verifyOTPAndRegister;
window.uploadImage = uploadImage;
window.logout = logout;
window.toggleModal = toggleModal;
window.submitNewFolder = submitNewFolder;
window.openFolderPicker = openFolderPicker;
window.assignAssetToFolder = assignAssetToFolder;
window.openFolderView = openFolderView;
window.removeAssetFromFolder = removeAssetFromFolder;
window.exitFolderView = exitFolderView;
window.openLightbox = openLightbox;
window.navigateLightbox = navigateLightbox;
window.closeLightbox = closeLightbox;
window.filterGallery = filterGallery;
window.deleteImage = deleteImage;
window.downloadImage = downloadImage;
window.loginWithPassword = loginWithPassword;
window.verifyOTPAndRegister = verifyOTPAndRegister;
window.toggleViewMode = toggleViewMode;
window.resetAuthFlow = resetAuthFlow;
window.showDashboard = showDashboard;
window.showToast = showToast;
window.submitNewFolder = submitNewFolder;
window.openFolderPicker = openFolderPicker;
window.openFolderView = openFolderView;
window.removeAssetFromFolder = removeAssetFromFolder;
window.exitFolderView = exitFolderView;
window.openLightbox = openLightbox;
window.navigateLightbox = navigateLightbox;
window.closeLightbox = closeLightbox;
window.filterGallery = filterGallery;
window.deleteImage = deleteImage;
window.downloadImage = downloadImage;
window.checkUserFlow = checkUserFlow;
window.logout = logout;
window.toggleModal = toggleModal;
window.uploadImage = uploadImage;
window.resetAuthFlow = resetAuthFlow;
window.submitNewFolder = submitNewFolder;
window.openFolderPicker = openFolderPicker;
window.assignAssetToFolder = assignAssetToFolder;
window.openFolderView = openFolderView;
window.removeAssetFromFolder = removeAssetFromFolder;
window.exitFolderView = exitFolderView;
window.openLightbox = openLightbox;
window.navigateLightbox = navigateLightbox;
window.closeLightbox = closeLightbox;
window.filterGallery = filterGallery;
window.deleteImage = deleteImage;
window.downloadImage = downloadImage;
window.toggleViewMode = toggleViewMode;
window.resetAuthFlow = resetAuthFlow;
window.showDashboard = showDashboard;
window.showToast = showToast;
window.openFolderPicker = openFolderPicker;
window.openFolderView = openFolderView;
window.removeAssetFromFolder = removeAssetFromFolder;
window.exitFolderView = exitFolderView;
window.openLightbox = openLightbox;
window.navigateLightbox = navigateLightbox;
window.closeLightbox = closeLightbox;
window.filterGallery = filterGallery;
window.deleteImage = deleteImage;
window.downloadImage = downloadImage;
