const router = require('express').Router();

const { asyncHandler }  = require('../utils/asyncHandler');
const { sanitizePhone } = require('../utils/validators');
const { supabase }      = require('../services/supabase');

// ─── GET ALL FOLDERS ──────────────────────────────────────────────
router.get('/folders', asyncHandler(async (req, res) => {
    const cleanPhone = sanitizePhone(req.query.phoneNumber);
    if (!cleanPhone) return res.status(400).json({ error: "Invalid phone number." });

    const { data: folders, error } = await supabase
        .from('folders')
        .select('id, name, created_at, folder_images(count)')
        .eq('phone_number', cleanPhone)
        .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
        folders: (folders || []).map(f => ({
            id:    f.id,
            name:  f.name,
            count: f.folder_images?.[0]?.count ?? 0
        }))
    });
}));

// ─── CREATE FOLDER ────────────────────────────────────────────────
router.post('/folders', asyncHandler(async (req, res) => {
    const { name }   = req.body;
    const cleanPhone = sanitizePhone(req.body.phoneNumber);

    if (!cleanPhone)   return res.status(400).json({ error: "Invalid phone number." });
    if (!name?.trim()) return res.status(400).json({ error: "Folder name required." });

    const { data, error } = await supabase
        .from('folders')
        .insert([{ phone_number: cleanPhone, name: name.trim().slice(0, 100) }])
        .select().single();

    if (error) throw error;
    res.status(201).json({ success: true, folder: data });
}));

// ─── DELETE FOLDER ────────────────────────────────────────────────
router.delete('/folders/:id', asyncHandler(async (req, res) => {
    const { id }     = req.params;
    const cleanPhone = sanitizePhone(req.body.phoneNumber);

    if (!cleanPhone) return res.status(400).json({ error: "Invalid phone number." });

    const { data: folder } = await supabase
        .from('folders').select('id')
        .eq('id', id).eq('phone_number', cleanPhone).maybeSingle();
    if (!folder) return res.status(403).json({ error: "Folder not found or access denied." });

    // CASCADE will handle folder_images
    const { error } = await supabase.from('folders').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
}));

// ─── ADD IMAGE TO FOLDER ──────────────────────────────────────────
router.post('/folders/add', asyncHandler(async (req, res) => {
    const { folderId, messageId } = req.body;
    const cleanPhone = sanitizePhone(req.body.phoneNumber);

    if (!cleanPhone || !folderId || !messageId)
        return res.status(400).json({ error: "Missing parameters." });

    // Ownership check
    const { data: folder } = await supabase
        .from('folders').select('id')
        .eq('id', folderId).eq('phone_number', cleanPhone).maybeSingle();
    if (!folder) return res.status(403).json({ error: "Folder access denied." });

    const { error } = await supabase
        .from('folder_images')
        .insert([{ folder_id: folderId, message_id: String(messageId) }]);

    if (error?.code === '23505') return res.json({ success: true, message: "Already linked." });
    if (error) throw error;
    res.json({ success: true });
}));

// ─── GET FOLDER IMAGES ───────────────────────────────────────────
router.get('/folders/images', asyncHandler(async (req, res) => {
    const { folderId } = req.query;
    const cleanPhone   = sanitizePhone(req.query.phoneNumber);

    if (!cleanPhone || !folderId)
        return res.status(400).json({ error: "Missing parameters." });

    // Ownership check
    const { data: folder } = await supabase
        .from('folders').select('id')
        .eq('id', folderId).eq('phone_number', cleanPhone).maybeSingle();
    if (!folder) return res.status(403).json({ error: "Folder access denied." });

    const { data: relations, error: relError } = await supabase
        .from('folder_images').select('message_id').eq('folder_id', folderId);
    if (relError) throw relError;
    if (!relations?.length) return res.json({ files: [] });

    // folder_images.message_id = TEXT → cast to INT for teledrive_files query
    const messageIds = relations.map(r => parseInt(r.message_id, 10));

    const { data: files, error: filesError } = await supabase
        .from('teledrive_files').select('*')
        .eq('phone', cleanPhone)
        .in('message_id', messageIds);
    if (filesError) throw filesError;

    res.json({ files: files || [] });
}));

// ─── REMOVE IMAGE FROM FOLDER ─────────────────────────────────────
router.delete('/folders/remove', asyncHandler(async (req, res) => {
    const { folderId, messageId } = req.body;
    const cleanPhone = sanitizePhone(req.body.phoneNumber);

    if (!cleanPhone || !folderId || !messageId)
        return res.status(400).json({ error: "Missing parameters." });

    // Ownership check
    const { data: folder } = await supabase
        .from('folders').select('id')
        .eq('id', folderId).eq('phone_number', cleanPhone).maybeSingle();
    if (!folder) return res.status(403).json({ error: "Folder access denied." });

    const { error } = await supabase.from('folder_images').delete()
        .eq('folder_id', folderId)
        .eq('message_id', String(messageId));
    if (error) throw error;

    res.json({ success: true });
}));

module.exports = router;