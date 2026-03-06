const orderRepo = require('../../database/repositories/orderRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const userRepo = require('../../database/repositories/userRepo');
const { isAdmin } = require('../middlewares/auth');
const config = require('../../config');
const texts = require('../../utils/texts');
const formatters = require('../../utils/formatters');
const orderHelper = require('../../utils/orderHelper');
const notificationService = require('../../services/notificationService');

module.exports = (bot) => {

    // ─── KUNDEN-BEFEHLE (/myorders, /feedbacks) ───────────────────────────────
    bot.command('myorders', async (ctx) => {
        try {
            const userId = ctx.from.id;
            // Simuliere den my_orders callback
            const fakeCtx = Object.assign({}, ctx, {
                answerCbQuery: () => Promise.resolve(),
                editMessageText: () => Promise.reject(new Error('no message to edit')),
                reply: ctx.reply.bind(ctx),
                from: ctx.from,
                session: ctx.session || {}
            });
            // Direkt die Bestellungen anzeigen
            const orderRepo = require('../../database/repositories/orderRepo');
            const texts = require('../../utils/texts');
            const formatters = require('../../utils/formatters');
            const orders = await orderRepo.getActiveOrdersByUser(userId);
            if (!orders || orders.length === 0) {
                return ctx.reply(texts.getMyOrdersEmpty(), {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '🛍 Zum Shop', callback_data: 'shop_menu' }]] }
                });
            }
            let text = texts.getMyOrdersHeader() + '\n\n';
            const keyboard = [];
            orders.forEach((order, i) => {
                const date = new Date(order.created_at).toLocaleDateString('de-DE');
                const statusLabel = texts.getCustomerStatusLabel(order.status);
                text += `${i + 1}. \`#${order.order_id}\`\n`;
                text += `💰 ${formatters.formatPrice(order.total_amount)} | ${statusLabel}\n`;
                if (order.digital_delivery) text += `🔐 _Digitale Lieferung verfügbar_\n`;
                text += `📅 ${date}\n\n`;
                if (order.status === 'offen' && !order.tx_id) {
                    keyboard.push([{ text: `💸 Zahlen: ${order.order_id}`, callback_data: `confirm_pay_${order.order_id}` }]);
                }
                keyboard.push([{ text: `📋 Bestellung #${order.order_id}`, callback_data: `cust_order_detail_${order.order_id}` }]);
            });
            keyboard.push([{ text: '🔙 Hauptmenü', callback_data: 'back_to_main' }]);
            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
        } catch (error) {
            console.error('myorders command error:', error.message);
            ctx.reply('❌ Fehler beim Laden deiner Bestellungen.');
        }
    });

    bot.command('feedbacks', async (ctx) => {
        try {
            const feedbackRepo = require('../../database/repositories/feedbackRepo');
            const texts = require('../../utils/texts');
            const limit = 10;
            const stats = await feedbackRepo.getFeedbackStats();
            const { data: feedbacks, count: totalFeedbacks } = await feedbackRepo.getApprovedFeedbacks(limit, 0);
            let text = '';
            const inline_keyboard = [];
            if (!feedbacks || feedbacks.length === 0) {
                text = texts.getPublicFeedbacksEmpty();
            } else {
                text = texts.getPublicFeedbacksHeader(stats.average, stats.total);
                feedbacks.forEach(fb => {
                    text += `${'⭐'.repeat(fb.rating)} - *${fb.username}*\n${fb.comment ? `_"${fb.comment}"_` : ''}\n\n`;
                });
                const totalPages = Math.ceil(totalFeedbacks / limit);
                if (totalPages > 1) {
                    inline_keyboard.push([{ text: '➡️ Mehr', callback_data: 'view_feedbacks_2' }]);
                }
            }
            inline_keyboard.push([{ text: '🔙 Hauptmenü', callback_data: 'back_to_main' }]);
            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard } });
        } catch (error) {
            console.error('feedbacks command error:', error.message);
            ctx.reply('❌ Fehler beim Laden der Feedbacks.');
        }
    });



    // GEFIXT: Reagiert jetzt nur noch auf echte Order-IDs, nicht mehr auf ähnliche Wörter!
    bot.hears(/^\/(order[a-zA-Z0-9]+)$/i, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1].toLowerCase();
            const order = await orderRepo.getOrderByOrderId(orderId);
            
            if (!order) return ctx.reply(`⚠️ Bestellung \`${orderId}\` nicht gefunden.`, { parse_mode: 'Markdown' });
            
            await orderHelper.clearOldNotifications(ctx, order);
            const payload = await orderHelper.buildOrderViewPayload(order);
            await ctx.reply(payload.text, { 
                parse_mode: 'Markdown', 
                reply_markup: payload.reply_markup, 
                disable_web_page_preview: true 
            });
        } catch (error) {
            console.error('Dynamic Order Command Error:', error.message);
            ctx.reply('❌ Fehler beim Laden der Bestellung.');
        }
    });

    bot.command('orderid', isAdmin, async (ctx) => {
        try {
            const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!args) return ctx.reply('⚠️ Beispiel: `/orderid orderc4ae82`', { parse_mode: 'Markdown' });
            const order = await orderRepo.getOrderByOrderId(args);
            if (!order) return ctx.reply(`⚠️ Bestellung "${args}" nicht gefunden.`);
            
            await orderHelper.clearOldNotifications(ctx, order);
            const payload = await orderHelper.buildOrderViewPayload(order);
            await ctx.reply(payload.text, { parse_mode: 'Markdown', reply_markup: payload.reply_markup, disable_web_page_preview: true });
        } catch (error) {
            console.error('OrderID Error:', error.message);
            ctx.reply('❌ Fehler beim Laden.');
        }
    });

    bot.command('id', isAdmin, async (ctx) => {
        try {
            const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!args) return ctx.reply('⚠️ Beispiel: `/id orderc4ae82`', { parse_mode: 'Markdown' });
            const order = await orderRepo.getOrderByOrderId(args);
            if (!order) return ctx.reply('⚠️ Nicht gefunden.');
            
            await orderHelper.clearOldNotifications(ctx, order);
            const payload = await orderHelper.buildOrderViewPayload(order);
            await ctx.reply(payload.text, { parse_mode: 'Markdown', reply_markup: payload.reply_markup, disable_web_page_preview: true });
        } catch (error) {
            console.error('ID Error:', error.message);
            ctx.reply('❌ Fehler.');
        }
    });

    bot.command('deleteid', isAdmin, async (ctx) => {
        try {
            const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!args) return ctx.reply('⚠️ Beispiel: `/deleteid orderc4ae82`', { parse_mode: 'Markdown' });

            const order = await orderRepo.getOrderByOrderId(args);
            if (!order) return ctx.reply(`⚠️ Bestellung "${args}" nicht gefunden.`);

            const isMaster = ctx.from.id === Number(config.MASTER_ADMIN_ID);

            if (isMaster) {
                await orderHelper.clearOldNotifications(ctx, order);
                await orderRepo.deleteOrder(args);
                ctx.reply(`🗑 Bestellung \`${order.order_id}\` gelöscht.`, { parse_mode: 'Markdown' });
            } else {
                const adminName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
                const approval = await approvalRepo.createApproval(
                    order.order_id, 'DELETE', null, adminName
                );

                ctx.reply(`📨 Löschanfrage für \`${order.order_id}\` an den Master gesendet.`, { parse_mode: 'Markdown' });

                notificationService.sendTo(config.MASTER_ADMIN_ID,
                    `🗑 *Löschanfrage*\n\nAdmin: ${adminName}\nBestellung: \`${order.order_id}\`\n\nSoll die Bestellung gelöscht werden?`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✅ Genehmigen', callback_data: `odel_approve_${approval.id}` }],
                                [{ text: '❌ Ablehnen', callback_data: `odel_reject_${approval.id}` }]
                            ]
                        }
                    }
                ).catch(() => {});
            }
        } catch (error) {
            console.error('DeleteID Error:', error.message);
            ctx.reply('❌ Fehler.');
        }
    });

    // NEU: /allorders (ersetzt das fehlerhafte /orders)
    bot.command('allorders', isAdmin, async (ctx) => {
        try {
            const orders = await orderRepo.getAllOrders(30);
            if (!orders || orders.length === 0) return ctx.reply('📋 Keine Bestellungen vorhanden.');

            let text = '📋 *Alle Bestellungen*\n\n';
            orders.forEach((order, i) => {
                const date = new Date(order.created_at).toLocaleDateString('de-DE');
                const txBadge = order.status === 'bezahlt_pending' ? '💸 ' : '';
                text += `${i + 1}. ${txBadge}/${order.order_id} | ${formatters.formatPrice(order.total_amount)} | ${texts.getStatusLabel(order.status)} | ${date}\n`;
            });

            const isMaster = ctx.from.id === Number(config.MASTER_ADMIN_ID);
            const keyboard = { inline_keyboard: [] };
            if (isMaster) {
                keyboard.inline_keyboard.push([{ text: '🗑 ALLE löschen', callback_data: 'orders_delete_all_confirm' }]);
            }

            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch (error) {
            console.error('AllOrders Error:', error.message);
            ctx.reply('❌ Fehler beim Laden.');
        }
    });

    // NEU: /allopenorders
    bot.command('allopenorders', isAdmin, async (ctx) => {
        try {
            const orders = await orderRepo.getOpenOrders(30);
            if (!orders || orders.length === 0) return ctx.reply('📋 Keine offenen Bestellungen vorhanden.');

            let text = '📋 *Alle offenen Bestellungen*\n\n';
            orders.forEach((order, i) => {
                const date = new Date(order.created_at).toLocaleDateString('de-DE');
                const txBadge = order.status === 'bezahlt_pending' ? '💸 ' : '';
                text += `${i + 1}. ${txBadge}/${order.order_id} | ${formatters.formatPrice(order.total_amount)} | ${texts.getStatusLabel(order.status)} | ${date}\n`;
            });

            await ctx.reply(text, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('AllOpenOrders Error:', error.message);
            ctx.reply('❌ Fehler beim Laden.');
        }
    });

    bot.command('ban', isAdmin, async (ctx) => {
        try {
            const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!args || !/^\d+$/.test(args)) return ctx.reply('⚠️ Beispiel: `/ban 123456789`', { parse_mode: 'Markdown' });
            const targetId = Number(args);
            if (targetId === ctx.from.id) return ctx.reply(texts.getBanSelfError());
            if (targetId === Number(config.MASTER_ADMIN_ID)) return ctx.reply(texts.getBanMasterError());
            if (await userRepo.isUserBanned(targetId)) return ctx.reply(texts.getBanAlreadyBanned());
            
            await userRepo.banUser(targetId);
            const pendingBan = await userRepo.createPendingBan(targetId, ctx.from.id);
            bot.telegram.sendMessage(targetId, texts.getBannedMessage()).catch(() => {});
            
            const bannedBy = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
            notificationService.notifyMasterBan({
                userId: targetId, bannedBy, banId: pendingBan.id,
                time: new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
            }).catch(() => {});
            
            ctx.reply(texts.getBanConfirmation(targetId), { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Ban Error:', error.message);
            ctx.reply('❌ Fehler.');
        }
    });
};
