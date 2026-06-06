const router = require('express').Router();

const { supabase } = require('../services/supabase');
const asyncHandler = require('../utils/asyncHandler');

router.get('/folders', asyncHandler(async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId." });

    const { data, error } = await supabase.from('televault_folders')
        .select('id, name, created_at, televault_folder_images(count)')
        .eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw error;

    res.json({ folders: (data || []).map(f => ({
        id: f.id, name: f.name,
        count: f.televault_folder_images?.[0]?.count ?? 0
    }))});
}));

router.post('/folders', asyncHandler(async (req, res) => {
    const { userId, name } = req.body;
    if (!userId || !name?.trim()) return res.status(400).json({ error: "Missing params." });

    const { data, error } = await supabase.from('televault_folders')
        .insert([{ user_id: userId, name: name.trim().slice(0, 100) }])
        .select().single();
    if (error) throw error;
    res.status(201).json({ success: true, folder: data });
}));

router.delete('/folders/:id', asyncHandler(async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId." });

    const { data: f } = await supabase.from('televault_folders').select('id')
        .eq('id', req.params.id).eq('user_id', userId).maybeSingle();
    if (!f) return res.status(403).json({ error: "Access denied." });

    const { error } = await supabase.from('televault_folders').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
}));

router.post('/folders/add', asyncHandler(async (req, res) => {
    const { userId, folderId, messageId } = req.body;
    if (!userId || !folderId || !messageId)
        return res.status(400).json({ error: "Missing params." });

    const { data: f } = await supabase.from('televault_folders').select('id')
        .eq('id', folderId).eq('user_id', userId).maybeSingle();
    if (!f) return res.status(403).json({ error: "Access denied." });

    const { error } = await supabase.from('televault_folder_images')
        .insert([{ folder_id: folderId, message_id: String(messageId) }]);
    if (error?.code === '23505') return res.json({ success: true });
    if (error) throw error;
    res.json({ success: true });
}));

router.get('/folders/images', asyncHandler(async (req, res) => {
    const { userId, folderId } = req.query;
    if (!userId || !folderId) return res.status(400).json({ error: "Missing params." });

    const { data: f } = await supabase.from('televault_folders').select('id')
        .eq('id', folderId).eq('user_id', userId).maybeSingle();
    if (!f) return res.status(403).json({ error: "Access denied." });

    const { data: rels } = await supabase.from('televault_folder_images')
        .select('message_id').eq('folder_id', folderId);
    if (!rels?.length) return res.json({ files: [] });

    const ids = rels.map(r => parseInt(r.message_id, 10));
    const { data: files, error } = await supabase.from('televault_files')
        .select('*').eq('user_id', userId).in('message_id', ids);
    if (error) throw error;
    res.json({ files: files || [] });
}));

router.delete('/folders/remove', asyncHandler(async (req, res) => {
    const { userId, folderId, messageId } = req.body;
    if (!userId || !folderId || !messageId)
        return res.status(400).json({ error: "Missing params." });

    const { data: f } = await supabase.from('televault_folders').select('id')
        .eq('id', folderId).eq('user_id', userId).maybeSingle();
    if (!f) return res.status(403).json({ error: "Access denied." });

    const { error } = await supabase.from('televault_folder_images').delete()
        .eq('folder_id', folderId).eq('message_id', String(messageId));
    if (error) throw error;
    res.json({ success: true });
}));

module.exports = router;