async function handleFilesSelected() {
    const input = $('fileSelector'); 
    let files = Array.from(input.files || []); 
    input.value = '';
    if (!files.length || state.uploading) return;
    
    files = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (!files.length) return showToast("Only images and videos.", "error");
    if (files.length > MAX_FILES) { 
        showToast(`Max ${MAX_FILES} files.`, "warn"); 
        files = files.slice(0, MAX_FILES); 
    }

    state.uploading = true;
    setUploadSpinner(true);
    showUploadBar(files.length);

    let ok = 0;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            updateUploadBar(i + 1, files.length, file.name, 0);
            const f = file.type.startsWith('image/') ? await compressImage(file) : file;
            await uploadSingle(f, (progress) => {
                updateUploadBar(i + 1, files.length, file.name, progress);
            });
            ok++;
        } catch (err) { 
            showToast(`Failed: ${file.name}`, 'error'); 
        }
    }

    state.uploading = false;
    setUploadSpinner(false);
    hideUploadBar();
    
    if (ok) { 
        showToast(`${ok} file${ok > 1 ? 's' : ''} uploaded!`); 
        loadGallery(); 
    }
}

function showUploadBar(total) {
    $('uploadProgressBar').classList.remove('hidden');
    $('uploadCounter').textContent = `0 / ${total}`;
    $('uploadProgressFill').style.width = '0%';
    $('uploadStatusText').textContent = 'Preparing...';
}

function updateUploadBar(current, total, fileName, fileProgress) {
    const baseProgress = ((current - 1) / total) * 100;
    const currentProgress = (fileProgress / 100) * (100 / total);
    const totalProgress = Math.min(99, baseProgress + currentProgress);
    
    $('uploadProgressFill').style.width = totalProgress + '%';
    $('uploadCounter').textContent = `${current} / ${total}`;
    $('uploadFileName').textContent = fileName;
    $('uploadStatusText').textContent = fileProgress >= 100 
        ? `Processing ${current} of ${total}...`
        : `Uploading ${current} of ${total}...`;
}

function hideUploadBar() {
    $('uploadProgressFill').style.width = '100%';
    $('uploadStatusText').textContent = 'Complete!';
    setTimeout(() => {
        $('uploadProgressBar').classList.add('hidden');
    }, 800);
}
