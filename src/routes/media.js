const router  = require('express').Router();
const multer  = require('multer');

const mtproto = require('../services/mtproto');

const { MAX_FILE_SIZE, BOT_TOKEN } = require('../config/env');
const { supabase }                  = require('../services/supabase');
const { bot, InputFile, buildFileUrl } = require('../services/telegram');
const asyncHandler                  = require('../utils/asyncHandler');
const fileIdCache                   = require('../stores/fileIdCache');

const ALLOWED_MIME = [
    'image/jpeg','image/png','image/gif','image/webp',
    'video/mp4','video/quicktime','video/webm'
];

const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        ALLOWED_MIME.includes(file.mimetype) ? cb(null, true) : cb(new Error('Invalid file type.'));
    }
});

// Upload
router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file received." });
    
    const { userId, deviceFingerprint } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId." });

    const { data: user } = await supabase
        .from('televault_users').select('channel_id, is_connected, storage_mode')
        .eq('user_id', userId).maybeSingle();

    if (!user?.is_connected || !user?.channel_id)
        return res.status(400).json({ error: "Not connected. Please reconnect." });

    const isVideo = req.file.mimetype.startsWith('video/');
    const isImage = req.file.mimetype.startsWith('image/');
    
    let finalName = (req.body.fileName || req.file.originalname)
        .replace(/[^\w\s.\-]/g, '').slice(0, 200);
    
    if (isVideo && !finalName.match(/\.(mp4|mov|webm|mkv)$/i)) {
        const ext = req.file.mimetype.split('/')[1] || 'mp4';
        finalName += '.' + ext;
    }

    let messageId, fileId, fileType;
    
    try {
        if (user.storage_mode === 'mtproto') {
            // MTProto upload (2GB capable)
            if (!deviceFingerprint) {
                return res.status(400).json({ error: 'Device fingerprint required' });
            }
            
            const result = await mtproto.uploadFile(userId, deviceFingerprint, req.file, finalName);
            messageId = result.messageId;
            fileType = isVideo ? 'video' : 'image';
            fileId = `mtproto:${messageId}`;
            
            console.log(`[Upload MTProto] ✅ ${finalName}`);
        } else {
            // Bot mode (existing flow)
            const input = new InputFile(req.file.buffer, finalName);
            
            if (isVideo) {
                try {
                    const r = await bot.api.sendVideo(user.channel_id, input, { 
                        caption: finalName,
                        supports_streaming: true
                    });
                    messageId = r.message_id;
                    fileId = r.video?.file_id;
                    fileType = 'video';
                } catch (videoErr) {
                    console.warn('[Upload] sendVideo failed, trying sendDocument');
                    const r = await bot.api.sendDocument(user.channel_id, input, { 
                        caption: finalName 
                    });
                    messageId = r.message_id;
                    fileId = r.document?.file_id;
                    fileType = 'video';
                }
            } else if (isImage) {
                const r = await bot.api.sendPhoto(user.channel_id, input, { 
                    caption: finalName 
                });
                messageId = r.message_id;
                fileId = r.photo[r.photo.length - 1].file_id;
                fileType = 'image';
            } else {
                const r = await bot.api.sendDocument(user.channel_id, input, { 
                    caption: finalName 
                });
                messageId = r.message_id;
                fileId = r.document?.file_id;
                fileType = 'image';
            }
            
            if (!fileId) throw new Error("Failed to get file ID");
            console.log(`[Upload Bot] ✅ ${finalName}`);
        }
    } catch (err) {
        console.error('[Upload Error]', err.message);
        
        if (err.message === 'NO_SESSION' || err.message === 'NO_CHANNEL') {
            return res.status(401).json({ error: 'DEVICE_NOT_AUTHORIZED' });
        }
        if (err.message.includes('AUTH_KEY')) {
            if (deviceFingerprint) {
                await mtproto.clearSession(userId, deviceFingerprint);
            }
            return res.status(401).json({ error: 'SESSION_EXPIRED' });
        }
        
        return res.status(500).json({ 
            error: err.message.includes('too large') 
                ? "File too large" 
                : "Upload failed: " + err.message 
        });
    }

    const { error } = await supabase.from('televault_files').insert({
        user_id: userId, 
        file_name: finalName, 
        message_id: messageId,
        file_id: fileId, 
        file_type: fileType,
        file_size: req.file.size,
        created_at: new Date().toISOString()
    });
    
    if (error) throw error;
    res.json({ success: true, messageId, fileType });
}));

// Gallery
router.get('/gallery', asyncHandler(async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId." });

    const page   = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit  = Math.min(30, parseInt(req.query.limit || '20', 10));
    const offset = (page - 1) * limit;

    const { data: files, error, count } = await supabase
        .from('televault_files').select('*', { count: 'exact' })
        .eq('user_id', userId).order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({
        files: files || [], total: count || 0, page, limit,
        hasMore: (offset + limit) < (count || 0)
    });
}));

// Stream image
router.get('/image', asyncHandler(async (req, res) => {
    const { userId, messageId, deviceFingerprint } = req.query;
    if (!userId || !messageId)    return res.status(400).send("Missing params.");
    if (!/^\d+$/.test(messageId)) return res.status(400).send("Invalid ID.");

    try {
        const { data: user } = await supabase
            .from('televault_users')
            .select('storage_mode')
            .eq('user_id', userId)
            .single();
        
        const { data: file } = await supabase
            .from('televault_files').select('file_id, file_type, file_name')
            .eq('user_id', userId).eq('message_id', parseInt(messageId, 10))
            .maybeSingle();

        if (!file) return res.status(404).send("Not found.");

        let buffer;
        let mime;

        if (user?.storage_mode === 'mtproto') {
            // MTProto download (2GB capable)
            if (!deviceFingerprint) return res.status(400).send("Device required");
            
            buffer = await mtproto.downloadFile(userId, deviceFingerprint, messageId);
            
            if (file.file_type === 'video') {
                const ext = file.file_name.split('.').pop().toLowerCase();
                mime = { 'mp4': 'video/mp4', 'mov': 'video/quicktime', 'webm': 'video/webm', 'mkv': 'video/x-matroska' }[ext] || 'video/mp4';
            } else {
                const ext = file.file_name.split('.').pop().toLowerCase();
                mime = { 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp' }[ext] || 'image/jpeg';
            }
        } else {
            // Bot mode (existing)
            if (!file?.file_id) return res.status(404).send("Not found.");

            const cacheKey = file.file_id;
            let fileUrl = fileIdCache.get(cacheKey);

            if (!fileUrl) {
                try {
                    const tgFile = await bot.api.getFile(file.file_id);
                    fileUrl = buildFileUrl(tgFile.file_path);
                    fileIdCache.set(cacheKey, fileUrl);
                } catch (err) {
                    if (err.message?.includes('file is too big')) {
                        return res.status(413).json({ 
                            error: "TOO_LARGE",
                            message: "File too large to preview (>20MB)."
                        });
                    }
                    throw err;
                }
            }

            const response = await fetch(fileUrl);
            if (!response.ok) {
                fileIdCache.delete(cacheKey);
                return res.status(500).send("Fetch failed.");
            }

            buffer = Buffer.from(await response.arrayBuffer());
            
            if (file.file_type === 'video') {
                const ext = file.file_name.split('.').pop().toLowerCase();
                mime = { 'mp4': 'video/mp4', 'mov': 'video/quicktime', 'webm': 'video/webm' }[ext] || 'video/mp4';
            } else {
                const ext = file.file_name.split('.').pop().toLowerCase();
                mime = { 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp' }[ext] || 'image/jpeg';
            }
        }

        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'private, max-age=7200');
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
    } catch (err) {
        console.error('[Image]', err.message);
        if (err.message.includes('AUTH_KEY')) {
            if (req.query.deviceFingerprint) {
                await mtproto.clearSession(userId, req.query.deviceFingerprint);
            }
            return res.status(401).send("SESSION_EXPIRED");
        }
        res.status(500).send("Error loading media.");
    }
}));
// Delete
router.delete('/delete', asyncHandler(async (req, res) => {
    const { userId, messageId, deviceFingerprint } = req.body;
    if (!userId || !messageId) return res.status(400).json({ error: "Missing params." });

    const { data: user } = await supabase
        .from('televault_users')
        .select('channel_id, storage_mode')
        .eq('user_id', userId)
        .maybeSingle();

    if (!user) return res.status(404).json({ error: "User not found." });

    try {
        if (user.storage_mode === 'mtproto') {
            if (deviceFingerprint) {
                await mtproto.deleteFile(userId, deviceFingerprint, messageId);
            }
        } else if (user.channel_id) {
            try { 
                await bot.api.deleteMessage(user.channel_id, parseInt(messageId, 10)); 
            } catch (err) { 
                console.warn('[Delete Bot]', err.message); 
            }
        }
    } catch (err) {
        console.warn('[Delete]', err.message);
    }

    await supabase.from('televault_folder_images').delete()
        .eq('message_id', String(messageId));

    const { error } = await supabase.from('televault_files').delete()
        .eq('user_id', userId)
        .eq('message_id', parseInt(messageId, 10));
    if (error) throw error;

    res.json({ success: true });
}));

module.exports = router;