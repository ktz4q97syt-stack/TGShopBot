const userRepo = require('../../database/repositories/userRepo');
const uiHelper = require('../../utils/uiHelper');
const { isAdmin } = require('../middlewares/auth');
const config = require('../../config');
const texts = require('../../utils/texts');
const adminKeyboards = require('../keyboards/adminKeyboards');

module.exports = (bot) => {
    bot.action('admin_panel', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const userId = ctx.from.id;
            const role = await userRepo.getUserRole(userId);
            const isMaster = userId === Number(config.MASTER_ADMIN_ID);
            const keyboard = adminKeyboards.getAdminMenu(isMaster);
            await uiHelper.updateOrSend(ctx, texts.getWelcomeText(isMaster, role), keyboard);
        } catch (error) {}
    });

    bot.action('admin_info', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await uiHelper.updateOrSend(ctx, texts.getAdminInfoText(), adminKeyboards.getBackToAdminPanel());
        } catch (error) {}
    });

    bot.action('admin_start_broadcast', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { 
            await ctx.scene.enter('broadcastScene'); 
        } catch (error) {}
    });
};
