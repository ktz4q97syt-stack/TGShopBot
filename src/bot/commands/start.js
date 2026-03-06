const userRepo = require('../../database/repositories/userRepo');
const orderRepo = require('../../database/repositories/orderRepo');
const settingsRepo = require('../../database/repositories/settingsRepo');
const masterMenu = require('../keyboards/masterMenu');
const adminKeyboards = require('../keyboards/adminKeyboards');
const customerMenu = require('../keyboards/customerMenu');
const config = require('../../config');
const texts = require('../../utils/texts');

module.exports = (bot) => {
    bot.command('start', async (ctx) => {
        try {
            if (!ctx.session) ctx.session = {};

            const userId = ctx.from.id;
            const username = ctx.from.username || ctx.from.first_name || 'Kunde';
            const isMaster = userId === Number(config.MASTER_ADMIN_ID);

            if (!isMaster) {
                try {
                    const banned = await userRepo.isUserBanned(userId);
                    if (banned) {
                        return ctx.reply(texts.getBannedMessage()).catch(() => {});
                    }
                } catch (e) {}
            }

            await userRepo.upsertUser(userId, username);
            const role = await userRepo.getUserRole(userId);

            if (!isMaster) {
                try {
                    const hasReceived = await userRepo.hasReceivedWelcome(userId);
                    if (!hasReceived) {
                        const welcomeMsg = await settingsRepo.getSetting('welcome_message');
                        if (welcomeMsg && welcomeMsg.trim() !== '') {
                            const pinnedMsg = await ctx.reply(welcomeMsg, { parse_mode: 'Markdown' });
                            await ctx.pinChatMessage(pinnedMsg.message_id, { disable_notification: true }).catch(() => {});
                            await userRepo.markWelcomeReceived(userId);
                        }
                    }
                } catch (e) {
                    console.error('Welcome Msg Error:', e.message);
                }
            }

            const text = texts.getWelcomeText(isMaster, role);
            let keyboard;

            if (isMaster) {
                keyboard = masterMenu();
            } else if (role === 'admin') {
                keyboard = adminKeyboards.getAdminMenu(false);
            } else {
                const hasOrders = await orderRepo.hasActiveOrders(userId);
                keyboard = customerMenu(hasOrders);
            }

            const sentMessage = await ctx.reply(text, {
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            });

            if (ctx.session.lastMenuMessageId) {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.lastMenuMessageId).catch(() => {});
            }

            await ctx.deleteMessage().catch(() => {});

            ctx.session.lastMenuMessageId = sentMessage.message_id;

        } catch (error) {
            console.error('Start Command Error:', error.message);
        }
    });
};
