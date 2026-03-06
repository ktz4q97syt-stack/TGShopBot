const orderRepo = require('../../database/repositories/orderRepo');
const userRepo = require('../../database/repositories/userRepo');
const feedbackRepo = require('../../database/repositories/feedbackRepo');
const texts = require('../../utils/texts');
const formatters = require('../../utils/formatters');
const notificationService = require('../../services/notificationService');

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

                if (order.status === 'abgeschlossen') {
                    keyboard.push([{ text: `🗑 Löschen: ${order.order_id}`, callback_data: `cust_del_order_${order.order_id}` }]);
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

    bot.action(/^cust_del_order_(.+)$/, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            
            await orderRepo.updateOrderStatus(orderId, 'loeschung_angefragt');
            
            const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');
            
            if (notificationService.notifyAdminOrderDeleteRequest) {
                notificationService.notifyAdminOrderDeleteRequest({
                    orderId,
                    userId: ctx.from.id,
                    username
                }).catch(e => console.error('NotifyDeleteRequest fail:', e));
            }

            ctx.answerCbQuery('🗑 Bestellung aus der Übersicht entfernt.').catch(() => {});
            await ctx.reply('ℹ️ Deine Bestellung wurde aus deiner Übersicht entfernt. Ein Admin wird die endgültige Löschung aus dem System prüfen.');

            ctx.update.callback_query.data = 'my_orders';
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error('Customer Delete Order Error:', error.message);
            ctx.answerCbQuery('⚠️ Fehler beim Ausblenden.', { show_alert: true }).catch(() => {});
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

    bot.action('cancel_txid', async (ctx) => {
        ctx.answerCbQuery('Abgebrochen').catch(() => {});
        if (ctx.session) ctx.session.awaitingTxId = null;
        await ctx.reply('❌ TX-ID Eingabe abgebrochen.', {
            reply_markup: { inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]] }
        });
    });

    bot.action(/^cust_ping_(.+)$/, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const userId = ctx.from.id;
            const canPing = await userRepo.canPing(userId);
            if (!canPing) return ctx.answerCbQuery(texts.getPingCooldown().replace('⏰ ', ''), { show_alert: true });
            
            await userRepo.setPingTimestamp(userId);
            const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');
            
            notificationService.notifyAdminsPing({ userId, username, orderId }).catch(e => console.error('NotifyPing fail:', e));
            
            ctx.answerCbQuery('✅ Ping gesendet!').catch(() => {});
            await ctx.reply(texts.getPingSent(), {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]] }
            });
        } catch (error) {
            console.error('Ping Error:', error.message);
            ctx.answerCbQuery('⚠️ Dienst momentan nicht erreichbar.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^cust_contact_(.+)$/, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const canContact = await userRepo.canContact(ctx.from.id);
            if (!canContact) return ctx.answerCbQuery(texts.getContactCooldown().replace('⏰ ', ''), { show_alert: true });
            ctx.answerCbQuery().catch(() => {});
            await ctx.scene.enter('contactScene', { orderId });
        } catch (error) {
            console.error('Contact Error:', error.message);
            ctx.answerCbQuery('⚠️ Fehler beim Starten des Kontakts.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^view_feedbacks(?:_(\d+))?$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const page = ctx.match && ctx.match[1] ? parseInt(ctx.match[1]) : 1;
            const limit = 10;
            const offset = (page - 1) * limit;

            const stats = await feedbackRepo.getFeedbackStats();
            const { data: feedbacks, count: totalFeedbacks } = await feedbackRepo.getApprovedFeedbacks(limit, offset);
            
            let text = '';
            const inline_keyboard = [];
            
            if (!feedbacks || feedbacks.length === 0) {
                text = texts.getPublicFeedbacksEmpty();
            } else {
                text = texts.getPublicFeedbacksHeader(stats.average, stats.total);
                feedbacks.forEach(fb => {
                    const stars = '⭐'.repeat(fb.rating);
                    const date = new Date(fb.created_at).toLocaleDateString('de-DE');
                    text += `${stars} - *${fb.username}* (${date})\n`;
                    if (fb.comment) text += `_"${fb.comment}"_\n`;
                    text += `\n`;
                });

                const totalPages = Math.ceil(totalFeedbacks / limit);
                if (totalPages > 1) {
                    const navRow = [];
                    if (page > 1) {
                        navRow.push({ text: '⬅️', callback_data: `view_feedbacks_${page - 1}` });
                    }
                    navRow.push({ text: `Seite ${page} / ${totalPages}`, callback_data: 'ignore_click' });
                    if (page < totalPages) {
                        navRow.push({ text: '➡️', callback_data: `view_feedbacks_${page + 1}` });
                    }
                    inline_keyboard.push(navRow);
                }
            }

            inline_keyboard.push([{ text: '🔙 Zurück', callback_data: 'back_to_main' }]);
            
            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard } }).catch(async () => {
                await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard } });
            });
        } catch (error) {
            console.error('View Feedbacks Error:', error.message);
            ctx.reply('❌ Fehler beim Laden der Feedbacks.').catch(() => {});
        }
    });

    bot.action('ignore_click', (ctx) => ctx.answerCbQuery().catch(() => {}));

    bot.action(/^start_feedback_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            await ctx.scene.enter('feedbackScene', { orderId });
        } catch (error) {
            console.error('Start Feedback Error:', error.message);
            ctx.reply('⚠️ Fehler beim Starten des Feedbacks.').catch(() => {});
        }
    });

    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.message || !ctx.message.text) return next();
        const input = ctx.message.text.trim();
        if (input.startsWith('/')) {
            ctx.session.awaitingTxId = null;
            return next();
        }

        if (ctx.session.awaitingTxId) {
            const orderId = ctx.session.awaitingTxId;
            ctx.session.awaitingTxId = null;
            try {
                const updated = await orderRepo.updateOrderTxId(orderId, input);
                if (!updated) return ctx.reply(`⚠️ Bestellung ${orderId} nicht gefunden.`);
                await ctx.reply(texts.getTxIdConfirmed(orderId), {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]] }
                });
                const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');
                
                notificationService.notifyAdminsTxId({
                    orderId, userId: ctx.from.id, username,
                    total: formatters.formatPrice(updated.total_amount || 0),
                    paymentName: updated.payment_method_name || 'N/A',
                    txId: input
                }).catch(e => console.error('NotifyTxId fail:', e));
            } catch (error) {
                console.error('TX-ID Save Error:', error.message);
                ctx.reply('❌ Fehler beim Speichern.');
            }
            return;
        }
        return next();
    });
};
