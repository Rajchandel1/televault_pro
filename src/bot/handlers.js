const { bot } = require('../services/telegram');
const { supabase } = require('../services/supabase');
const { APP_URL } = require('../config/env');
const pendingChannels = require('../stores/pendingChannels');

const startBot = () => {

    bot.command('start', async (ctx) => {
        const text       = ctx.message?.text || '';
        const param      = text.split(' ')[1] || '';
        const telegramId = ctx.from?.id?.toString();
        const chatId     = ctx.chat?.id?.toString();

        // Channel setup mode
        if (param.startsWith('ch_')) {
            const userId = param.replace('ch_', '');
            const { data: user } = await supabase
                .from('televault_users').select('id, name')
                .eq('user_id', userId).maybeSingle();

            if (!user) return ctx.reply("❌ Account not found. Register first.");

            pendingChannels.set(telegramId, userId);
            await ctx.reply(
                "📨 *Channel Setup*\n\n" +
                "Forward any message from your private channel to me.\n\n" +
                "I'll auto-detect and connect it.",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Quick connect mode
        if (param) {
            try {
                const { data: user } = await supabase
                    .from('televault_users').select('id, is_connected')
                    .eq('user_id', param).maybeSingle();

                if (!user) return ctx.reply("❌ Account not found.");
                if (user.is_connected)
                    return ctx.reply(`✅ Already connected!\n\n${APP_URL}`);

                await supabase.from('televault_users').update({
                    telegram_id: telegramId, channel_id: chatId, is_connected: true
                }).eq('user_id', param);

                await ctx.reply(
                    `✅ *Vault Connected!*\n\nYour files will be stored privately here.\n\n[Open TeleVault →](${APP_URL})`,
                    { parse_mode: 'Markdown' }
                );
            } catch (err) {
                console.error('[Quick Connect]', err.message);
                await ctx.reply("❌ Something went wrong.");
            }
            return;
        }

        await ctx.reply("👋 Welcome to TeleVault!\nOpen the app to get started.");
    });

    bot.on('message', async (ctx) => {
        try {
            const telegramId    = ctx.from?.id?.toString();
            const pendingUserId = pendingChannels.get(telegramId);
            if (!pendingUserId) return;

            const msg = ctx.message;
            const channelId = msg?.forward_from_chat?.id?.toString() ||
                              msg?.forward_origin?.chat?.id?.toString();
            const channelTitle = msg?.forward_from_chat?.title ||
                                 msg?.forward_origin?.chat?.title || "Channel";

            if (!channelId) {
                await ctx.reply("⚠️ Forward a message from your channel.");
                return;
            }

            try {
                const member = await bot.api.getChatMember(channelId, ctx.me.id);
                if (!['administrator', 'creator'].includes(member.status)) {
                    await ctx.reply("⚠️ I'm not admin in that channel. Add me first.");
                    return;
                }
            } catch {
                await ctx.reply("⚠️ Can't access that channel. Add me as admin first.");
                return;
            }

            await supabase.from('televault_users').update({
                telegram_id: telegramId, channel_id: channelId, is_connected: true
            }).eq('user_id', pendingUserId);

            pendingChannels.delete(telegramId);

            try {
                await bot.api.sendMessage(channelId,
                    "🔐 TeleVault vault activated!");
            } catch {}

            await ctx.reply(
                `🎉 *Channel Connected!*\n\n📁 ${channelTitle}\n\n[Open TeleVault →](${APP_URL})`,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('[Forward Handler]', err.message);
        }
    });

    bot.start({ onStart: () => console.log('🤖 Bot running...') })
       .catch(err => console.error('[Bot Error]', err));
};

module.exports = { startBot };