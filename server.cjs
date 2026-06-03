require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcrypt');
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { CustomFile } = require("telegram/client/uploads");
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Read credentials from environment (user will manage .env)
const apiId = process.env.TELEGRAM_API_ID ? parseInt(process.env.TELEGRAM_API_ID, 10) : undefined;
const apiHash = process.env.TELEGRAM_API_HASH || undefined;

if (!apiId || !apiHash) {
    console.warn('WARNING: TELEGRAM_API_ID or TELEGRAM_API_HASH not set in environment. Telegram-related routes will fail until configured.');
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

let activeClients = {};
let otpTempCache = {};

const getCleanPhone = (phone) => {
    if (!phone) return "";
    let clean = phone.trim().replace(/\s+/g, '');
    if (!clean.startsWith('+')) clean = '+' + clean;
    return clean;
};

async function getClient(phone) {
    const cleanPhone = getCleanPhone(phone);
    if (activeClients[cleanPhone]) return activeClients[cleanPhone];

    const { data: user, error } = await supabase.from('teledrive_users').select('*').eq('phone', cleanPhone).maybeSingle();
    if (error || !user) throw new Error("User session not found. Please log in again.");

    const client = new TelegramClient(new StringSession(user.session_string), apiId, apiHash, { connectionRetries: 5 });
    await client.connect();
    activeClients[cleanPhone] = { client, channelId: user.channel_id, accessHash: user.access_hash };
    return activeClients[cleanPhone];
}

// Routes (kept same behavior)
app.post('/api/check-user', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ error: "Phone number is missing!" });

        const cleanPhone = getCleanPhone(phoneNumber);
        const { data: user, error } = await supabase.from('teledrive_users').select('phone').eq('phone', cleanPhone).maybeSingle();
        if (error) throw error;
        res.json({ exists: !!user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/send-otp', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ error: "Phone number is missing!" });

        const cleanPhone = getCleanPhone(phoneNumber);
        const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });
        await client.connect();
        const sendCodeResult = await client.sendCode({ apiId, apiHash }, cleanPhone);
        otpTempCache[cleanPhone] = { client, phoneCodeHash: sendCodeResult.phoneCodeHash };
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/verify-otp', async (req, res) => {
    try {
        const { phoneNumber, otpCode, password } = req.body;
        if (!password) return res.status(400).json({ error: "Password is required!" });

        const cleanPhone = getCleanPhone(phoneNumber);
        const tempSession = otpTempCache[cleanPhone];
        if (!tempSession) return res.status(400).json({ error: "Session timeout. Request OTP again." });

        await tempSession.client.invoke(new Api.auth.SignIn({ phoneNumber: cleanPhone, phoneCodeHash: tempSession.phoneCodeHash, phoneCode: otpCode }));
        const savedSessionString = tempSession.client.session.save();

        const createChannelResult = await tempSession.client.invoke(new Api.channels.CreateChannel({ title: "_my_cloud_gallery_storage_", about: "TeleVault Drive", broadcast: true, megagroup: false }));
        const storageChannelId = createChannelResult.chats[0].id.toString();
        const accessHash = createChannelResult.chats[0].accessHash.toString();

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const { error: dbError } = await supabase.from('teledrive_users').upsert({ phone: cleanPhone, password: hashedPassword, session_string: savedSessionString, channel_id: storageChannelId, access_hash: accessHash });
        if (dbError) throw dbError;

        activeClients[cleanPhone] = { client: tempSession.client, channelId: storageChannelId, accessHash };
        delete otpTempCache[cleanPhone];
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login-password', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        if (!phoneNumber || !password) return res.status(400).json({ error: "Phone and password are required!" });

        const cleanPhone = getCleanPhone(phoneNumber);
        const { data: user, error } = await supabase.from('teledrive_users').select('*').eq('phone', cleanPhone).maybeSingle();
        if (error || !user) return res.status(400).json({ error: "User account not found!" });

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) return res.status(400).json({ error: "Incorrect password! Please try again." });

        try { await getClient(cleanPhone); } catch (clientErr) { console.error("Failed background session warming:", clientErr.message); }
        res.json({ success: true, message: "Logged in successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        const { phoneNumber, fileName } = req.body;
        if (!req.file) return res.status(400).json({ error: "No file received!" });

        const cleanPhone = getCleanPhone(phoneNumber);
        const sessionData = await getClient(cleanPhone);

        const buffer = req.file.buffer;
        const finalFileName = fileName || req.file.originalname;

        const toUpload = new CustomFile(finalFileName, buffer.length, "", buffer);
        const uploadedFileToken = await sessionData.client.uploadFile({ file: toUpload, workers: 4 });

        const sendMediaResult = await sessionData.client.invoke(new Api.messages.SendMedia({ peer: new Api.InputPeerChannel({ channelId: BigInt(sessionData.channelId), accessHash: BigInt(sessionData.accessHash) }), media: new Api.InputMediaUploadedPhoto({ file: uploadedFileToken }), message: finalFileName, randomId: BigInt(Math.floor(Math.random() * 10000000000000)) }));

        let messageId = null;
        for (const update of sendMediaResult.updates) {
            if (update.className === 'UpdateNewChannelMessage' || update.className === 'UpdateNewMessage') { messageId = update.message.id; break; }
        }

        const { error: dbError } = await supabase.from('teledrive_files').insert({ phone: cleanPhone, file_name: finalFileName, message_id: messageId });
        if (dbError) throw dbError;
        res.json({ success: true });
    } catch (err) { console.error("Upload Error:", err); res.status(500).json({ error: err.message }); }
});

app.get('/api/gallery', async (req, res) => {
    try {
        const phone = req.query.phoneNumber || req.query.phone;
        if (!phone) return res.status(400).json({ error: "Phone number is missing!" });

        const cleanPhone = getCleanPhone(phone);
        const { data: files, error } = await supabase.from('teledrive_files').select('*').eq('phone', cleanPhone);
        if (error) throw error;
        res.json({ files: files || [] });
    } catch (err) { console.error("Gallery Error:", err); res.status(500).json({ error: "Internal Server Error" }); }
});

app.get('/api/image', async (req, res) => {
    try {
        const { phone, messageId } = req.query;
        if (!phone || !messageId) return res.status(400).send("Parameters missing");
        const cleanPhone = getCleanPhone(phone);
        const sessionData = await getClient(cleanPhone);

        const messages = await sessionData.client.getMessages(new Api.InputPeerChannel({ channelId: BigInt(sessionData.channelId), accessHash: BigInt(sessionData.accessHash) }), { ids: [parseInt(messageId)] });
        if (!messages || messages.length === 0) return res.status(404).send("Image not found");

        const buffer = await sessionData.client.downloadMedia(messages[0]);
        if (!buffer) return res.status(500).send("Empty media buffer");

        res.setHeader('Content-Type', 'image/jpeg');
        res.send(buffer);
    } catch (error) { console.error("❌ Image Stream Error:", error); res.status(500).send("Error loading image"); }
});

app.delete('/api/delete', async (req, res) => {
    try {
        const { phone, messageId } = req.body;
        if (!phone || !messageId) return res.status(400).json({ error: "Parameters missing" });
        const cleanPhone = getCleanPhone(phone);
        const sessionData = await getClient(cleanPhone);

        await sessionData.client.deleteMessages(new Api.InputPeerChannel({ channelId: BigInt(sessionData.channelId), accessHash: BigInt(sessionData.accessHash) }), [parseInt(messageId)], { revoke: true });

        const { error: dbError } = await supabase.from('teledrive_files').delete().eq('phone', cleanPhone).eq('message_id', parseInt(messageId));
        if (dbError) throw dbError;
        res.json({ success: true, message: "Deleted successfully!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Folder controllers (kept original logic)
app.get('/api/folders', async (req, res) => {
    const { phoneNumber } = req.query;
    if (!phoneNumber) return res.status(400).json({ error: "Missing identity token" });
    try {
        const { data: folders, error } = await supabase.from('folders').select(`id, name, folder_images(count)`).eq('phone_number', phoneNumber).order('created_at', { ascending: false });
        if (error) throw error;
        const formattedFolders = folders.map(f => ({ id: f.id, name: f.name, count: f.folder_images ? f.folder_images[0].count : 0 }));
        res.json({ folders: formattedFolders });
    } catch (err) { res.status(500).json({ error: "Failed to parse Supabase clusters" }); }
});

app.post('/api/folders', async (req, res) => {
    const { phoneNumber, name } = req.body;
    if (!phoneNumber || !name) return res.status(400).json({ error: "Missing parameters" });
    try {
        const { data, error } = await supabase.from('folders').insert([{ phone_number: phoneNumber, name: name }]).select();
        if (error) throw error;
        res.status(201).json({ success: true, folder: data[0] });
    } catch (err) { res.status(500).json({ error: "Database mapping collision occurred" }); }
});

app.post('/api/folders/add', async (req, res) => {
    const { folderId, messageId } = req.body;
    if (!folderId || !messageId) return res.status(400).json({ error: "Mapping arrays invalid" });
    try {
        const { error } = await supabase.from('folder_images').insert([{ folder_id: folderId, message_id: messageId }]);
        if (error && error.code === '23505') return res.json({ success: true, message: "Asset map preserved" });
        if (error) throw error;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Relational join assignment failed" }); }
});

app.get('/api/folders/images', async (req, res) => {
    const { folderId, phoneNumber } = req.query;
    if (!folderId || !phoneNumber) return res.status(400).json({ error: "Query context incomplete" });
    try {
        const { data: mappedRelations, error: relError } = await supabase.from('folder_images').select('message_id').eq('folder_id', folderId);
        if (relError) throw relError;
        const targetMessageIds = mappedRelations.map(r => r.message_id);
        if (targetMessageIds.length === 0) return res.json({ files: [] });
        const { data: files, error: filesError } = await supabase.from('teledrive_files').select('*').eq('phone', phoneNumber).in('message_id', targetMessageIds);
        if (filesError) throw filesError;
        res.json({ files });
    } catch (err) { console.error("💥 Final Crash Log:", err); res.status(500).json({ error: "Could not aggregate target assets" }); }
});

app.delete('/api/folders/remove', async (req, res) => {
    const { folderId, messageId } = req.body;
    try {
        const { error } = await supabase.from('folder_images').delete().eq('folder_id', folderId).eq('message_id', messageId);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Pointer drop layer processing crash" }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 TeleVault backend running on http://localhost:${PORT}`));
