const router  = require('express').Router();
const multer  = require('multer');

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
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId." });

    const { data: user } = await supabase
        .from('televault_users').select('channel_id, is_connected')
        .eq('user_id', userId).maybeSingle();

    if (!user?.is_connected || !user?.channel_id)
        return res.status(400).json({ error: "Not connected. Please reconnect." });

    const isVideo   = req.file.mimetype.startsWith('video/');
    const finalName = (req.body.fileName || req.file.originalname)
        .replace(/[^\w\s.\-]/g, '').slice(0, 200);

    let messageId, fileId;
    try {
        const input = new InputFile(req.file.buffer, finalName);
        if (isVideo) {
            const r = await bot.api.sendVideo(user.channel_id, input, { caption: finalName });
            messageId = r.message_id;
            fileId    = r.video?.file_id || r.document?.file_id;
        } else {
            const r = await bot.api.sendPhoto(user.channel_id, input, { caption: finalName });
            messageId = r.message_id;
            fileId    = r.photo[r.photo.length - 1].file_id;
        }
    } catch (err) {
        console.error('[Upload]', err.message);
        return res.status(500).json({ error: "Upload failed." });
    }

    const { error } = await supabase.from('televault_files').insert({
        user_id: userId, file_name: finalName, message_id: messageId,
        file_id: fileId, file_type: isVideo ? 'video' : 'image',
        created_at: new Date().toISOString()
    });
    if (error) throw error;

    res.json({ success: true, messageId });
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
    const { userId, messageId } = req.query;
    if (!userId || !messageId)    return res.status(400).send("Missing params.");
    if (!/^\d+$/.test(messageId)) return res.status(400).send("Invalid ID.");

    try {
        const { data: file } = await supabase
            .from('televault_files').select('file_id, file_type')
            .eq('user_id', userId).eq('message_id', parseInt(messageId, 10))
            .maybeSingle();

        if (!file?.file_id) return res.status(404).send("Not found.");

        const cacheKey = file.file_id;
        let fileUrl = fileIdCache.get(cacheKey);

        if (!fileUrl) {
            const tgFile = await bot.api.getFile(file.file_id);
            fileUrl = buildFileUrl(tgFile.file_path);
            fileIdCache.set(cacheKey, fileUrl);
        }

        const response = await fetch(fileUrl);
        if (!response.ok) {
            fileIdCache.delete(cacheKey);
            return res.status(500).send("Fetch failed.");
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const mime   = file.file_type === 'video' ? 'video/mp4' : 'image/jpeg';

        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'private, max-age=7200');
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
    } catch (err) {
        console.error('[Image]', err.message);
        res.status(500).send("Error loading media.");
    }
}));

// Delete
router.delete('/delete', asyncHandler(async (req, res) => {
    const { userId, messageId } = req.body;
    if (!userId || !messageId) return res.status(400).json({ error: "Missing params." });

    const { data: user } = await supabase
        .from('televault_users').select('channel_id')
        .eq('user_id', userId).maybeSingle();

    if (user?.channel_id) {
        try { await bot.api.deleteMessage(user.channel_id, parseInt(messageId, 10)); }
        catch (err) { console.warn('[Delete Bot]', err.message); }
    }

    await supabase.from('televault_folder_images').delete()
        .eq('message_id', String(messageId));
    const { error } = await supabase.from('televault_files').delete()
        .eq('user_id', userId).eq('message_id', parseInt(messageId, 10));
    if (error) throw error;

    res.json({ success: true });
}));

module.exports = router;