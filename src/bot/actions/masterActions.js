const userRepo = require('../../database/repositories/userRepo');
const paymentRepo = require('../../database/repositories/paymentRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const productRepo = require('../../database/repositories/productRepo');
const orderRepo = require('../../database/repositories/orderRepo');
const feedbackRepo = require('../../database/repositories/feedbackRepo');
const uiHelper = require('../../utils/uiHelper');
const orderHelper = require('../../utils/orderHelper');
const { isMasterAdmin } = require('../middlewares/auth');
const config = require('../../config');
const texts = require('../../utils/texts');
const masterMenu = require('../keyboards/masterMenu');
const notificationService = require('../../services/notificationService');

module.exports = (bot) => {
    bot.action('master_panel', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const role = await userRepo.getUserRole(ctx.from.id);
            await uiHelper.updateOrSend(ctx, texts.getWelcomeText(true, role), masterMenu());
        } catch (error) { 
            console.error('Master Panel Error:', error.message); 
        }
    });

    bot.action('master_info', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const text = texts.getMasterInfoText();
            await uiHelper.updateOrSend(ctx, text, {
                inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_panel' }]]
            });
        } catch (error) {
            console.error('Master Info Error:', error.message);
        }
    });

    bot.action('master_shop_management', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const text = texts.getMasterShopManagement();
            const keyboard = {
                inline_keyboard: [
                    [{ text: '👥 Admins verwalten', callback_data: 'master_manage_admins' }],
                    [{ text: '✅ Ausstehende Freigaben', callback_data: 'master_pending_approvals' }],
                    [{ text: '💳 Zahlungsarten verwalten', callback_data: 'master_manage_payments' }],
                    [{ text: '📝 Begrüßungsnachricht', callback_data: 'master_edit_welcome_msg' }],
                    [{ text: '⭐ Feedbacks', callback_data: 'master_manage_feedbacks' }],
                    [{ text: '🔙 Zurück', callback_data: 'master_panel' }]
                ]
            };
            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) { console.error('Shop Management Error:', error.message); }
    });

    bot.action('master_manage_payments', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const methods = await paymentRepo.getActivePaymentMethods();
            const keyboard = methods.map(m => ([{
                text: `💳 ${m.name}`,
                callback_data: `master_view_pay_${m.id}`
            }]));
            keyboard.push([{ text: '➕ Zahlungsart hinzufügen', callback_data: 'master_add_payment' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_shop_management' }]);
            await uiHelper.updateOrSend(ctx, '💳 *Zahlungsarten verwalten*', { inline_keyboard: keyboard });
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action('master_add_payment', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('addPaymentMethodScene');
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^master_view_pay_(.+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const method = await paymentRepo.getPaymentMethod(ctx.match[1]);
            if (!method) return ctx.answerCbQuery('Nicht gefunden.', { show_alert: true });
            let text = `💳 *${method.name}*\n\n`;
            if (method.wallet_address) text += `*Adresse:* \`${method.wallet_address}\`\n`;
            const keyboard = {
                inline_keyboard: [
                    [{ text: '🗑 Zahlungsart löschen', callback_data: `master_del_pay_${method.id}` }],
                    [{ text: '🔙 Zurück', callback_data: 'master_manage_payments' }]
                ]
            };
            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^master_del_pay_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            await paymentRepo.deletePaymentMethod(ctx.match[1]);
            ctx.answerCbQuery('✅ Gelöscht').catch(() => {});
            ctx.update.callback_query.data = 'master_manage_payments';
            return bot.handleUpdate(ctx.update);
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action('master_customer_overview', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const customers = await userRepo.getAllCustomers();
            let text = customers.length > 0 ? `📊 *Kundenübersicht* (${customers.length})\n\n` : '📊 Keine Kunden registriert.';
            const keyboard = customers.slice(0, 20).map(c => ([{ text: `👤 ${c.username || c.telegram_id}`, callback_data: `cust_detail_${c.telegram_id}` }]));
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_panel' }]);
            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^cust_detail_(\d+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const targetId = ctx.match[1];
            const orders = await orderRepo.getOrdersByUser(targetId);
            let text = `👤 *Kunde: ${targetId}*\n\n📋 Bestellungen: ${orders.length}\n`;
            const kb = {
                inline_keyboard: [
                    [{ text: '👤 Kontaktieren', url: `tg://user?id=${targetId}` }],
                    [{ text: '🔨 Bannen', callback_data: `cust_ban_${targetId}` }],
                    [{ text: '🗑 Löschen', callback_data: `cust_delete_${targetId}` }],
                    [{ text: '🔙 Zurück', callback_data: 'master_customer_overview' }]
                ]
            };
            await uiHelper.updateOrSend(ctx, text, kb);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^cust_ban_(\d+)$/, isMasterAdmin, async (ctx) => {
        try {
            const targetId = Number(ctx.match[1]);
            if (targetId === Number(config.MASTER_ADMIN_ID)) return ctx.answerCbQuery('Nicht möglich.', { show_alert: true });
            await userRepo.banUser(targetId);
            const pendingBan = await userRepo.createPendingBan(targetId, ctx.from.id);
            bot.telegram.sendMessage(targetId, texts.getBannedMessage()).catch(() => {});
            ctx.answerCbQuery('🔨 Gebannt!').catch(() => {});
            await ctx.reply(`🔨 User ${targetId} gebannt.`);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^cust_delete_(\d+)$/, isMasterAdmin, async (ctx) => {
        try {
            await userRepo.deleteUserCompletely(ctx.match[1]);
            ctx.answerCbQuery('🗑 Gelöscht!').catch(() => {});
            await ctx.reply(`🗑 User ${ctx.match[1]} gelöscht.`);
        } catch (error) { console.error(error.message); }
    });

    bot.action('master_pending_approvals', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const pending = await approvalRepo.getPendingApprovals();
            if (pending.length === 0) return uiHelper.updateOrSend(ctx, '✅ Keine ausstehenden Freigaben.', { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_shop_management' }]] });
            const keyboard = pending.map(p => {
                const icon = p.action_type === 'DELETE' ? '🗑' : '💰';
                return [{ text: `${icon} Anfrage prüfen`, callback_data: `master_view_appr_${p.id}` }];
            });
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_shop_management' }]);
            await uiHelper.updateOrSend(ctx, '📋 *Ausstehende Anfragen:*', { inline_keyboard: keyboard });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^master_view_appr_(.+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const request = await approvalRepo.getApprovalById(ctx.match[1]);
            if (!request) return ctx.answerCbQuery('Anfrage nicht gefunden.', { show_alert: true });
            
            let text = `📋 *Anfrage Details*\n\n`;
            text += `Typ: ${request.action_type === 'DELETE' ? '🗑 Löschen' : '💰 Preisänderung'}\n`;
            text += `Angefragt von: ${request.requested_by}\n`;
            if (request.action_type === 'PRICE_CHANGE') {
                text += `Neuer Preis: ${request.new_value}€\n`;
            }

            const keyboard = {
                inline_keyboard: [
                    [{ text: '✅ Genehmigen', callback_data: `master_approve_${request.id}` }],
                    [{ text: '❌ Ablehnen', callback_data: `master_reject_appr_${request.id}` }],
                    [{ text: '🔙 Zurück', callback_data: 'master_pending_approvals' }]
                ]
            };
            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^master_approve_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const request = await approvalRepo.getApprovalById(ctx.match[1]);
            if (request.action_type === 'PRICE_CHANGE') {
                await productRepo.toggleProductStatus(request.target_id, 'price', parseFloat(request.new_value));
            } else if (request.action_type === 'DELETE') {
                await productRepo.deleteProduct(request.target_id);
            }
            await approvalRepo.updateApprovalStatus(request.id, 'approved');
            ctx.answerCbQuery('✅ Genehmigt!').catch(() => {});
            ctx.update.callback_query.data = 'master_pending_approvals';
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^master_reject_appr_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            await approvalRepo.updateApprovalStatus(ctx.match[1], 'rejected');
            ctx.answerCbQuery('❌ Abgelehnt.').catch(() => {});
            ctx.update.callback_query.data = 'master_pending_approvals';
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^odel_confirm_([\w-]+)$/, isMasterAdmin, async (ctx) => {
        const orderId = ctx.match[1];
        try {
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (order) await orderHelper.clearOldNotifications(ctx, order);
            await orderRepo.deleteOrder(orderId);
            ctx.answerCbQuery('🗑 Gelöscht!').catch(() => {});
            await ctx.editMessageText(`🗑 Bestellung \`#${orderId}\` wurde endgültig gelöscht.`, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error(error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^odel_approve_([\w-]+)$/, isMasterAdmin, async (ctx) => {
        try {
            const approval = await approvalRepo.getApprovalById(ctx.match[1]);
            const order = await orderRepo.getOrderByOrderId(approval.new_value);
            if (order) {
                await orderHelper.clearOldNotifications(ctx, order);
                await orderRepo.deleteOrder(order.order_id);
            }
            await approvalRepo.updateApprovalStatus(approval.id, 'approved');
            ctx.answerCbQuery('✅ Bestellung gelöscht!').catch(() => {});
            await ctx.editMessageText(`✅ Löschanfrage genehmigt für \`#${approval.new_value}\`.`);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^odel_reject_([\w-]+)$/, isMasterAdmin, async (ctx) => {
        try {
            await approvalRepo.updateApprovalStatus(ctx.match[1], 'rejected');
            ctx.answerCbQuery('❌ Abgelehnt.').catch(() => {});
            await ctx.editMessageText('❌ Löschanfrage abgelehnt.');
        } catch (error) { console.error(error.message); }
    });

    bot.action('master_manage_admins', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const admins = await userRepo.getAllAdmins();
            const keyboard = admins
                .filter(a => Number(a.telegram_id) !== Number(config.MASTER_ADMIN_ID))
                .map(a => ([{ text: `❌ ${a.username || a.telegram_id} entlassen`, callback_data: `master_fire_${a.telegram_id}` }]));
            keyboard.push([{ text: '➕ Admin ernennen (ID)', callback_data: 'master_prompt_add_admin' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_shop_management' }]);
            await uiHelper.updateOrSend(ctx, '👥 *Personalverwaltung*', { inline_keyboard: keyboard });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^master_fire_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            await userRepo.removeAdmin(ctx.match[1]);
            ctx.answerCbQuery('Admin entlassen.').catch(() => {});
            ctx.update.callback_query.data = 'master_manage_admins';
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error(error.message); }
    });

    bot.action('master_ack_msg', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery('Gelesen.').catch(() => {});
        await ctx.deleteMessage().catch(() => {});
    });

    bot.action('master_edit_welcome_msg', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('editWelcomeMsgScene');
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^master_manage_feedbacks(?:_(\d+))?$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const page = ctx.match && ctx.match[1] ? parseInt(ctx.match[1]) : 1;
            const limit = 10;
            const offset = (page - 1) * limit;

            const stats = await feedbackRepo.getFeedbackStats();
            const { data: feedbacks, count: totalFeedbacks } = await feedbackRepo.getApprovedFeedbacks(limit, offset);

            const text = texts.getMasterFeedbackManagement(stats.average, stats.total);
            const inline_keyboard = [];

            feedbacks.forEach(fb => {
                const stars = '⭐'.repeat(fb.rating);
                const shortComment = fb.comment ? ` - "${fb.comment.substring(0, 15)}..."` : '';
                const label = `${stars} | ${fb.username}${shortComment}`;
                inline_keyboard.push([{ text: `❌ Löschen: ${label}`, callback_data: `master_del_fb_${fb.id}` }]);
            });

            const totalPages = Math.ceil(totalFeedbacks / limit);
            if (totalPages > 1) {
                const navRow = [];
                if (page > 1) navRow.push({ text: '⬅️', callback_data: `master_manage_feedbacks_${page - 1}` });
                navRow.push({ text: `Seite ${page}/${totalPages}`, callback_data: 'ignore_click' });
                if (page < totalPages) navRow.push({ text: '➡️', callback_data: `master_manage_feedbacks_${page + 1}` });
                inline_keyboard.push(navRow);
            }

            if (totalFeedbacks > 0) {
                inline_keyboard.push([{ text: '🗑 ALLE Feedbacks löschen', callback_data: 'master_del_all_fb_confirm' }]);
            }
            
            inline_keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_shop_management' }]);

            await uiHelper.updateOrSend(ctx, text, { inline_keyboard });
        } catch (error) { console.error('Manage Feedbacks Error:', error.message); }
    });

    bot.action(/^master_del_fb_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const fbId = ctx.match[1];
            await feedbackRepo.deleteFeedback(fbId); 
            ctx.answerCbQuery('🗑 Feedback gelöscht.').catch(() => {});
            ctx.update.callback_query.data = 'master_manage_feedbacks';
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error(error.message); }
    });

    bot.action('master_del_all_fb_confirm', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        await uiHelper.updateOrSend(ctx, '⚠️ *Möchtest du WIRKLICH alle freigegebenen Feedbacks unwiderruflich löschen?*', {
            inline_keyboard: [
                [{ text: '🚨 JA, ALLE LÖSCHEN', callback_data: 'master_del_all_fb_exec' }],
                [{ text: '❌ Abbrechen', callback_data: 'master_manage_feedbacks' }]
            ],
            parse_mode: 'Markdown'
        });
    });

    bot.action('master_del_all_fb_exec', isMasterAdmin, async (ctx) => {
        try {
            await feedbackRepo.deleteAllFeedbacks(); 
            ctx.answerCbQuery('🗑 Alle Feedbacks gelöscht.').catch(() => {});
            ctx.update.callback_query.data = 'master_manage_feedbacks';
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error(error.message); }
    });

    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.session.awaitingAdminId || ctx.from.id !== Number(config.MASTER_ADMIN_ID)) return next();
        const targetId = ctx.message.text.trim();
        if (!/^\d+$/.test(targetId)) return ctx.reply('⚠️ Nur IDs senden.');
        await userRepo.updateUserRole(targetId, 'admin');
        ctx.session.awaitingAdminId = false;
        await ctx.reply(`✅ Nutzer ${targetId} ist nun Admin.`);
    });
};
