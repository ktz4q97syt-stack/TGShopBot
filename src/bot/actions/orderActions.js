const orderRepo = require('../../database/repositories/orderRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const userRepo = require('../../database/repositories/userRepo');
const feedbackRepo = require('../../database/repositories/feedbackRepo'); 
const texts = require('../../utils/texts');
const formatters = require('../../utils/formatters');
const orderHelper = require('../../utils/orderHelper'); 
const uiHelper = require('../../utils/uiHelper');
const { isAdmin } = require('../middlewares/auth');
const config = require('../../config');
const notificationService = require('../../services/notificationService');

const FINAL_STATUSES = ['abgeschlossen', 'abgebrochen', 'loeschung_angefragt'];

module.exports = (bot) => {

    bot.action('my_orders', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const userId = ctx.from.id;
            const orders = await orderRepo.getActiveOrdersByUser(userId);

            if (!orders || orders.length === 0) {
                const emptyText = texts.getMyOrdersEmpty();
                const kb = { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'back_to_main' }]] };
                return await ctx.editMessageText(emptyText, { parse_mode: 'Markdown', reply_markup: kb }).catch(async () => {
                    await ctx.reply(emptyText, { parse_mode: 'Markdown', reply_markup: kb });
                });
            }

            let text = texts.getMyOrdersHeader() + '\n\n';
            const keyboard = [];

            orders.forEach((order, i) => {
                const date = new Date(order.created_at).toLocaleDateString('de-DE');
                const statusLabel = texts.getCustomerStatusLabel(order.status);
                text += `${i + 1}. \`#${order.order_id}\`\n`;
                text += `💰 ${formatters.formatPrice(order.total_amount)} | ${statusLabel}\n`;
                if (order.delivery_method === 'shipping') text += `🚚 Versand\n`;
                else if (order.delivery_method === 'pickup') text += `🏪 Abholung\n`;
                if (order.tx_id) text += `🔑 TX: \`${order.tx_id}\`\n`;
                text += `📅 ${date}\n\n`;

                if (order.status === 'offen' && !order.tx_id) {
                    keyboard.push([{ text: `💸 Zahlen: ${order.order_id}`, callback_data: `confirm_pay_${order.order_id}` }]);
                }

                keyboard.push([
                    { text: `🔔 Ping: ${order.order_id}`, callback_data: `cust_ping_${order.order_id}` },
                    { text: `💬 Kontakt`, callback_data: `cust_contact_${order.order_id}` }
                ]);
            });

            keyboard.push([{ text: '🔙 Zurück', callback_data: 'back_to_main' }]);
            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }).catch(async () => {
                await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
            });
        } catch (error) {
            console.error('My Orders Error:', error.message);
        }
    });

    bot.action(/^confirm_pay_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            if (!ctx.session) ctx.session = {};
            ctx.session.awaitingTxId = orderId;
            await ctx.reply(texts.getTxIdPrompt(), {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_txid' }]] }
            });
        } catch (error) { console.error('Confirm Pay Error:', error.message); }
    });

    bot.action('admin_open_orders', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orders = await orderRepo.getOpenOrders(20);
            let text = '';
            const keyboard = [];

            if (!orders || orders.length === 0) {
                text = '📋 Keine offenen Bestellungen.';
            } else {
                text = '📋 *Offene Bestellungen*\n\n';
                orders.forEach((order, i) => {
                    const date = new Date(order.created_at).toLocaleDateString('de-DE');
                    const txBadge = order.tx_id ? ' 💸' : '';
                    text += `${i + 1}. \`#${order.order_id}\` | ${formatters.formatPrice(order.total_amount)} | ${texts.getStatusLabel(order.status)}${txBadge} | ${date}\n`;
                    keyboard.push([{
                        text: `📋 ${order.order_id}${order.status === 'bezahlt_pending' ? ' 💸' : ''}`,
                        callback_data: `oview_${order.order_id}`
                    }]);
                });
            }
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);
            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^oview_([a-zA-Z0-9]+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.reply(`⚠️ Bestellung "${orderId}" nicht gefunden.`);

            await orderHelper.clearOldNotifications(ctx, order);
            const payload = await orderHelper.buildOrderViewPayload(order);

            await uiHelper.updateOrSend(ctx, payload.text, payload.reply_markup);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^ostatus_([a-zA-Z0-9]+)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            let newStatus = ctx.match[2];
            if (newStatus === 'processing') newStatus = 'in_bearbeitung';

            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.answerCbQuery('Nicht gefunden.', { show_alert: true });

            if (FINAL_STATUSES.includes(order.status)) {
                return uiHelper.updateOrSend(ctx, `⚠️ Status ist bereits final (${order.status}). Wirklich ändern?`, {
                    inline_keyboard: [
                        [{ text: '✅ Erzwingen', callback_data: `oforce_${orderId}_${newStatus}` }],
                        [{ text: '❌ Abbrechen', callback_data: `oview_${orderId}` }]
                    ]
                });
            }

            const updated = await orderRepo.updateOrderStatus(orderId, newStatus);
            await notificationService.notifyCustomerStatusUpdate(updated.user_id, orderId, newStatus);
            
            const payload = await orderHelper.buildOrderViewPayload(updated);
            await uiHelper.updateOrSend(ctx, payload.text, payload.reply_markup);
            ctx.answerCbQuery(`✅ Status: ${texts.getStatusLabel(newStatus)}`).catch(() => {});
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^oforce_([a-zA-Z0-9]+)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const newStatus = ctx.match[2];
            const updated = await orderRepo.updateOrderStatus(orderId, newStatus);
            await notificationService.notifyCustomerStatusUpdate(updated.user_id, orderId, newStatus);
            const payload = await orderHelper.buildOrderViewPayload(updated);
            await uiHelper.updateOrSend(ctx, payload.text, payload.reply_markup);
            ctx.answerCbQuery(`✅ Status erzwungen: ${newStatus}`).catch(() => {});
        } catch (e) { console.error(e); }
    });

    bot.action(/^odeliv_([a-zA-Z0-9]+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            if (!ctx.session) ctx.session = {};
            ctx.session.awaitingDigitalDelivery = orderId;
            await ctx.reply(texts.getDigitalDeliveryPrompt(orderId), {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_delivery' }]] }
            });
        } catch (error) { console.error(error.message); }
    });

    bot.action('cancel_delivery', async (ctx) => {
        ctx.answerCbQuery('Abgebrochen').catch(() => {});
        if (ctx.session) ctx.session.awaitingDigitalDelivery = null;
        await ctx.reply('❌ Digitale Auslieferung abgebrochen.');
    });

    bot.action(/^odel_([a-zA-Z0-9]+)$/, isAdmin, async (ctx) => {
        const orderId = ctx.match[1];
        if (ctx.from.id === Number(config.MASTER_ADMIN_ID)) {
            return uiHelper.updateOrSend(ctx, `⚠️ \`#${orderId}\` endgültig löschen?`, {
                inline_keyboard: [
                    [{ text: '🗑 Endgültig löschen', callback_data: `odel_confirm_${orderId}` }],
                    [{ text: '❌ Abbrechen', callback_data: `oview_${orderId}` }]
                ]
            });
        }
        
        const adminName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
        const approval = await approvalRepo.createApproval(orderId, 'ORDER_DELETE', null, adminName);
        
        ctx.reply('📨 Löschanfrage an Master gesendet.');
        notificationService.sendTo(config.MASTER_ADMIN_ID, `🗑 *Löschanfrage*\nBestellung: \`#${orderId}\``, {
            reply_markup: { inline_keyboard: [[{ text: '✅ OK', callback_data: `odel_approve_${approval.id}` }, { text: '❌ NO', callback_data: `odel_reject_${approval.id}` }]] }
        });
    });

    bot.action(/^odel_confirm_([a-zA-Z0-9]+)$/, isAdmin, async (ctx) => {
        if (ctx.from.id !== Number(config.MASTER_ADMIN_ID)) return;
        try {
            const orderId = ctx.match[1];
            await orderRepo.deleteOrder(orderId);
            ctx.answerCbQuery('🗑 Bestellung gelöscht.').catch(() => {});
            
            await uiHelper.updateOrSend(ctx, `🗑 Bestellung \`#${orderId}\` wurde endgültig gelöscht.`, {
                inline_keyboard: [[{ text: '🔙 Zurück zum Panel', callback_data: 'admin_open_orders' }]]
            });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^cust_del_approve_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            await orderRepo.deleteOrder(orderId);
            ctx.answerCbQuery('✅ Löschung bestätigt.').catch(() => {});
            if (ctx.callbackQuery.message) {
                await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n*STATUS: Gelöscht ✅*', { parse_mode: 'Markdown' });
            }
        } catch (error) { console.error('Approve Customer Delete Error:', error.message); }
    });

    bot.action(/^cust_del_reject_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            await orderRepo.updateOrderStatus(orderId, 'abgeschlossen');
            ctx.answerCbQuery('❌ Löschung abgelehnt.').catch(() => {});
            if (ctx.callbackQuery.message) {
                await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n*STATUS: Abgelehnt ❌ (Wieder beim Kunden sichtbar)*', { parse_mode: 'Markdown' });
            }
        } catch (error) { console.error('Reject Customer Delete Error:', error.message); }
    });

    bot.action(/^allow_fb_([a-zA-Z0-9]+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            
            if (!order) return ctx.answerCbQuery('Bestellung nicht gefunden.', { show_alert: true });
            if (order.feedback_invited) return ctx.answerCbQuery('Bereits für Feedback qualifiziert.', { show_alert: true });

            await orderRepo.setFeedbackInvited(orderId, true);

            if (notificationService.notifyCustomerFeedbackInvite) {
                await notificationService.notifyCustomerFeedbackInvite(order.user_id, orderId);
            }

            order.feedback_invited = true;
            const payload = await orderHelper.buildOrderViewPayload(order);
            await uiHelper.updateOrSend(ctx, payload.text, payload.reply_markup);
            
            ctx.answerCbQuery('✅ Kunde wurde zum Feedback eingeladen!').catch(() => {});
        } catch (error) {
            console.error('Allow Feedback Error:', error.message);
            ctx.answerCbQuery('❌ Fehler beim Qualifizieren.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^fb_approve_(.+)$/, isAdmin, async (ctx) => {
        try {
            const feedbackId = ctx.match[1];
            await feedbackRepo.updateFeedbackStatus(feedbackId, 'approved');
            ctx.answerCbQuery('✅ Feedback freigegeben.').catch(() => {});
            if (ctx.callbackQuery.message) {
                await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n*STATUS: Freigegeben ✅*', { parse_mode: 'Markdown' });
            }
        } catch (error) { console.error('Approve FB Error:', error.message); }
    });

    bot.action(/^fb_reject_(.+)$/, isAdmin, async (ctx) => {
        try {
            const feedbackId = ctx.match[1];
            await feedbackRepo.updateFeedbackStatus(feedbackId, 'rejected');
            ctx.answerCbQuery('❌ Feedback abgelehnt.').catch(() => {});
            if (ctx.callbackQuery.message) {
                await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n*STATUS: Abgelehnt ❌*', { parse_mode: 'Markdown' });
            }
        } catch (error) { console.error('Reject FB Error:', error.message); }
    });

    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.message.text) return next();
        const input = ctx.message.text.trim();
        
        if (input.startsWith('/')) {
            ctx.session.awaitingTxId = null;
            ctx.session.awaitingNote = null;
            ctx.session.awaitingDigitalDelivery = null;
            return next();
        }

        if (ctx.session.awaitingDigitalDelivery) {
            const orderId = ctx.session.awaitingDigitalDelivery;
            ctx.session.awaitingDigitalDelivery = null;
            try {
                const order = await orderRepo.getOrderByOrderId(orderId);
                if (!order) return ctx.reply(`⚠️ Bestellung ${orderId} nicht gefunden.`);
                await orderHelper.clearOldNotifications(ctx, order);
                const formattedContent = input.split(',').map(item => `▪️ ${item.trim()}`).join('\n');
                const customerMessage = texts.getDigitalDeliveryCustomerMessage(orderId, formattedContent);
                const sentMsg = await bot.telegram.sendMessage(order.user_id, customerMessage, { parse_mode: 'Markdown' }).catch(() => null);
                
                if (sentMsg) {
                    await orderRepo.setDigitalDelivery(orderId, formattedContent);
                    await orderRepo.updateOrderStatus(orderId, 'abgeschlossen');
                    await orderRepo.addNotificationMsgId(orderId, sentMsg.chat.id, sentMsg.message_id);
                    await orderRepo.addAdminNote(orderId, ctx.from.username || ctx.from.id, `Digitale Lieferung gesendet.`);
                    await ctx.reply(texts.getDigitalDeliverySuccess(orderId), { 
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: '📋 Bestellung öffnen', callback_data: `oview_${orderId}` }]] }
                    });
                } else {
                    await ctx.reply(`❌ Fehler: Nachricht konnte nicht gesendet werden.`);
                }
            } catch (error) { console.error(error.message); }
            return;
        }

        if (ctx.session.awaitingTxId) {
            const orderId = ctx.session.awaitingTxId;
            ctx.session.awaitingTxId = null;
            const updated = await orderRepo.updateOrderTxId(orderId, input);
            ctx.reply(texts.getTxIdConfirmed(orderId), { parse_mode: 'Markdown' });
            
            const username = ctx.from.username ? `@${ctx.from.username}` : 'Kunde';
            notificationService.notifyAdminsTxId({ 
                orderId, userId: ctx.from.id, txId: input, 
                username, total: formatters.formatPrice(updated.total_amount) 
            }).catch(() => {});
            return;
        }

        if (ctx.session.awaitingNote) {
            const orderId = ctx.session.awaitingNote;
            ctx.session.awaitingNote = null;
            const author = ctx.from.username || `ID:${ctx.from.id}`;
            await orderRepo.addAdminNote(orderId, author, input);
            ctx.reply(texts.getNoteAdded(orderId), { parse_mode: 'Markdown' });
            return;
        }
        return next();
    });
};
