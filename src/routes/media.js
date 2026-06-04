const router = require('express').Router();
const multer = require('multer');

const { MAX_FILE_SIZE }    = require('../config/env');
const { asyncHandler }     = require('../utils/asyncHandler');
const { sanitizePhone }    = require('../utils/validators');
const { supabase }         = require('../services/supabase');
const {
    getClient, buildInputPeer, Api, CustomFile
} = require('../services/telegram');

// ─── MULTER ───────────────────────────────────────────────────────
const ALLOWED_MIME = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm'
];

const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        ALLOWED_MIME.includes(file.mimetype)
            ? cb(null, true)
            : cb(new Error('Invalid file type. Images and videos only.'));
    }
});

// ─── UPLOAD ───────────────────────────────────────────────────────
router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file received." });

    const cleanPhone = sanitizePhone(req.body.phoneNumber);
    if (!cleanPhone)  return res.status(400).json({ error: "Invalid phone number." });

    const sessionData = await getClient(cleanPhone);
    const isVideo     = req.file.mimetype.startsWith('video/');
    const finalName   = (req.body.fileName || req.file.originalname)
        .replace(/[^\w\s.\-]/g, '').slice(0, 200);

    const toUpload = new CustomFile(finalName, req.file.buffer.length, "", req.file.buffer);
    const uploaded = await sessionData.client.uploadFile({ file: toUpload, workers: 1 });

    const media = isVideo
        ? new Api.InputMediaUploadedDocument({
            file:       uploaded,
            mimeType:   req.file.mimetype,
            attributes: [
                new Api.DocumentAttributeFilename({ fileName: finalName }),
                new Api.DocumentAttributeVideo({ duration: 0, w: 0, h: 0 })
            ]
          })
        : new Api.InputMediaUploadedPhoto({ file: uploaded });

    const sendResult = await sessionData.client.invoke(new Api.messages.SendMedia({
        peer:     buildInputPeer(sessionData.channelId, sessionData.accessHash),
        media,
        message:  finalName,
        randomId: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))
    }));

    let messageId = null;
    for (const update of sendResult.updates) {
        if (update.className === 'UpdateNewChannelMessage' ||
            update.className === 'UpdateNewMessage') {
            messageId = update.message?.id ?? null;
            break;
        }
    }
    if (!messageId) throw new Error("Failed to get message ID.");

    const { error } = await supabase.from('teledrive_files').insert({
        phone:      cleanPhone,
        file_name:  finalName,
        message_id: messageId,
        file_type:  isVideo ? 'video' : 'image',
        created_at: new Date().toISOString()
    });
    if (error) throw error;

    res.json({ success: true, messageId, fileType: isVideo ? 'video' : 'image' });
}));

// ─── GALLERY (paginated) ──────────────────────────────────────────
router.get('/gallery', asyncHandler(async (req, res) => {
    const cleanPhone = sanitizePhone(req.query.phoneNumber || req.query.phone);
    if (!cleanPhone) return res.status(400).json({ error: "Invalid phone number." });

    const page   = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit  = Math.min(30, parseInt(req.query.limit || '20', 10));
    const offset = (page - 1) * limit;

    const { data: files, error, count } = await supabase
        .from('teledrive_files')
        .select('*', { count: 'exact' })
        .eq('phone', cleanPhone)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({
        files:   files || [],
        total:   count  || 0,
        page,
        limit,
        hasMore: (offset + limit) < (count || 0)
    });
}));

// ─── STREAM IMAGE/VIDEO ──────────────────────────────────────────
router.get('/image', asyncHandler(async (req, res) => {
    const { messageId } = req.query;
    const cleanPhone    = sanitizePhone(req.query.phone);

    if (!cleanPhone || !messageId) return res.status(400).send("Missing parameters.");
    if (!/^\d+$/.test(messageId))  return res.status(400).send("Invalid message ID.");

    const sessionData = await getClient(cleanPhone);

    const messages = await sessionData.client.getMessages(
        buildInputPeer(sessionData.channelId, sessionData.accessHash),
        { ids: [parseInt(messageId, 10)] }
    );

    if (!messages?.length) return res.status(404).send("Media not found.");

    const buffer = await sessionData.client.downloadMedia(messages[0], {
        outputFile: Buffer.alloc(0)
    });

    if (!buffer?.length) return res.status(500).send("Empty media buffer.");

    const msg      = messages[0];
    const isVideo  = msg.media?.className === 'MessageMediaDocument';
    const mimeType = isVideo
        ? (msg.media?.document?.mimeType || 'video/mp4')
        : 'image/jpeg';

    res.setHeader('Content-Type',   mimeType);
    res.setHeader('Cache-Control',  'private, max-age=7200');
    res.setHeader('Content-Length',  buffer.length);
    res.send(buffer);
}));

// ─── DELETE ───────────────────────────────────────────────────────
router.delete('/delete', asyncHandler(async (req, res) => {
    const { messageId } = req.body;
    const cleanPhone    = sanitizePhone(req.body.phone);

    if (!cleanPhone || !messageId)        return res.status(400).json({ error: "Missing parameters." });
    if (!/^\d+$/.test(String(messageId))) return res.status(400).json({ error: "Invalid message ID." });

    const sessionData = await getClient(cleanPhone);

    await sessionData.client.deleteMessages(
        buildInputPeer(sessionData.channelId, sessionData.accessHash),
        [parseInt(messageId, 10)],
        { revoke: true }
    );

    // Clean folder refs (message_id TEXT in folder_images)
    await supabase.from('folder_images').delete()
        .eq('message_id', String(messageId));

    const { error } = await supabase.from('teledrive_files').delete()
        .eq('phone', cleanPhone)
        .eq('message_id', parseInt(messageId, 10));
    if (error) throw error;

    res.json({ success: true });
}));

module.exports = router;