const { bot } = require('../services/telegram');
const { supabase } = require('../services/supabase');
const { APP_URL } = require('../config/env');
const pendingChannels = require('../stores/pendingChannels');

const startBot = () => {

    // ✅ /start command handler — improved
    bot.command('start', async (ctx) => {
        try {
            const text       = ctx.message?.text || '';
            const param      = text.split(' ')[1] || '';
            const telegramId = ctx.from?.id?.toString();
            const chatId     = ctx.chat?.id?.toString();
            const userName   = ctx.from?.first_name || 'there';

            console.log(`[Bot] /start from ${telegramId} | param: "${param}"`);

            // ─── Channel Setup Mode ───
            if (param.startsWith('ch_')) {
                const userId = param.replace('ch_', '');
                const { data: user } = await supabase
                    .from('televault_users').select('id, name')
                    .eq('user_id', userId).maybeSingle();

                if (!user) {
                    return await ctx.reply(
                        `❌ Account not found.\n\nPlease register on TeleVault first:\n${APP_URL}`,
                        { disable_web_page_preview: false }
                    );
                }

                pendingChannels.set(telegramId, userId);
                await ctx.reply(
                    `📨 *Channel Setup*\n\n` +
                    `Hi ${userName}! Forward any message from your private channel to me here.\n\n` +
                    `I'll auto-detect and connect it.\n\n` +
                    `_Make sure I'm added as admin in your channel first._`,
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            // ─── Quick Connect Mode ───
            if (param) {
                const userId = param;
                
                const { data: user } = await supabase
                    .from('televault_users').select('id, name, is_connected')
                    .eq('user_id', userId).maybeSingle();

                if (!user) {
                    return await ctx.reply(
                        `❌ Account not found.\n\nPlease register first:\n${APP_URL}`
                    );
                }

                if (user.is_connected) {
                    return await ctx.reply(
                        `✅ *Already connected!*\n\nOpen your vault: ${APP_URL}`,
                        { parse_mode: 'Markdown' }
                    );
                }

                // Save connection
                const { error } = await supabase.from('televault_users').update({
                    telegram_id: telegramId, 
                    channel_id: chatId, 
                    is_connected: true
                }).eq('user_id', userId);

                if (error) {
                    console.error('[Bot Update Error]', error.message);
                    return await ctx.reply("❌ Connection failed. Please try again.");
                }

                await ctx.reply(
                    `✅ *Vault Connected Successfully!*\n\n` +
                    `Hi ${userName}! Your files will be stored privately right here in our chat.\n\n` +
                    `👉 [Open TeleVault](${APP_URL})\n\n` +
                    `_Click the link above to return to your vault._`,
                    { 
                        parse_mode: 'Markdown',
                        disable_web_page_preview: false 
                    }
                );

                console.log(`[Bot] ✅ Quick connected: ${userId}`);
                return;
            }

            // ─── No Parameter (direct /start) ───
            await ctx.reply(
                `👋 *Welcome to TeleVault!*\n\n` +
                `Hi ${userName}! I'm your personal storage bot.\n\n` +
                `To get started:\n` +
                `1️⃣ Open TeleVault web app\n` +
                `2️⃣ Create your account\n` +
                `3️⃣ Click "Quick Connect"\n\n` +
                `👉 [Open TeleVault](${APP_URL})\n\n` +
                `_It takes less than 30 seconds!_`,
                { 
                    parse_mode: 'Markdown',
                    disable_web_page_preview: false 
                }
            );

        } catch (err) {
            console.error('[Bot /start Error]', err.message);
            await ctx.reply("❌ Something went wrong. Please try again.").catch(() => {});
        }
    });

    // ✅ Forward message handler — for channel setup
    bot.on('message', async (ctx) => {
        try {
            const telegramId = ctx.from?.id?.toString();
            const pendingUserId = pendingChannels.get(telegramId);
            if (!pendingUserId) return;

            const msg = ctx.message;
            const channelId = msg?.forward_from_chat?.id?.toString() ||
                              msg?.forward_origin?.chat?.id?.toString();
            const channelTitle = msg?.forward_from_chat?.title ||
                                 msg?.forward_origin?.chat?.title || "Channel";

            if (!channelId) {
                await ctx.reply(
                    `⚠️ I couldn't detect a channel.\n\n` +
                    `Please forward a message that was posted *inside your channel*.`,
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            // Verify bot is admin
            try {
                const member = await bot.api.getChatMember(channelId, ctx.me.id);
                if (!['administrator', 'creator'].includes(member.status)) {
                    return await ctx.reply(
                        `⚠️ I'm not an admin in that channel.\n\nAdd me as admin first, then forward again.`
                    );
                }
            } catch {
                return await ctx.reply(
                    `⚠️ Can't access that channel.\n\nMake sure I'm added as admin.`
                );
            }

            // Save
            await supabase.from('televault_users').update({
                telegram_id: telegramId, 
                channel_id: channelId, 
                is_connected: true
            }).eq('user_id', pendingUserId);

            pendingChannels.delete(telegramId);

            try {
                await bot.api.sendMessage(channelId,
                    "🔐 TeleVault activated!\nThis channel is now your secure storage."
                );
            } catch {}

            await ctx.reply(
                `🎉 *Channel Connected!*\n\n` +
                `📁 ${channelTitle}\n\n` +
                `👉 [Open TeleVault](${APP_URL})`,
                { parse_mode: 'Markdown', disable_web_page_preview: false }
            );

            console.log(`[Bot] ✅ Channel connected: ${pendingUserId}`);

        } catch (err) {
            console.error('[Bot Forward Error]', err.message);
        }
    });

    // ✅ Error handler
    bot.catch((err) => {
        console.error('[Bot Catch Error]', err.message);
    });

    bot.start({ 
        onStart: (botInfo) => {
            console.log(`🤖 Bot @${botInfo.username} is RUNNING!`);
        }
    }).catch(err => {
        console.error('[Bot START FAILED]', err.message);
    });
};

// ✅ Keep bot alive — ping every 4 minutes
setInterval(async () => {
    try {
        await bot.api.getMe();
        console.log('[Bot] ❤️ Heartbeat OK');
    } catch (err) {
        console.warn('[Bot] Heartbeat failed:', err.message);
    }
}, 4 * 60 * 1000);

module.exports = { startBot };