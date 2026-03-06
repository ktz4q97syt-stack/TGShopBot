const productRepo = require('../../database/repositories/productRepo');
const subcategoryRepo = require('../../database/repositories/subcategoryRepo');
const orderRepo = require('../../database/repositories/orderRepo');
const userRepo = require('../../database/repositories/userRepo');
const uiHelper = require('../../utils/uiHelper');
const formatters = require('../../utils/formatters');
const texts = require('../../utils/texts');
const masterMenu = require('../keyboards/masterMenu');
const adminKeyboards = require('../keyboards/adminKeyboards');
const customerMenu = require('../keyboards/customerMenu');
const config = require('../../config');

module.exports = (bot) => {

    bot.action('back_to_main', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const userId = ctx.from.id;
            const isMaster = userId === Number(config.MASTER_ADMIN_ID);

            await userRepo.upsertUser(userId, ctx.from.username || ctx.from.first_name || 'Kunde');
            const role = await userRepo.getUserRole(userId);

            let text, keyboard;
            if (isMaster) {
                text = texts.getWelcomeText(true, 'master');
                keyboard = masterMenu();
            } else if (role === 'admin') {
                text = texts.getWelcomeText(false, 'admin');
                keyboard = adminKeyboards.getAdminMenu(false);
            } else {
                const hasOrders = await orderRepo.hasActiveOrders(userId);
                text = texts.getWelcomeText(false, 'customer');
                keyboard = customerMenu(hasOrders);
            }

            await ctx.deleteMessage().catch(() => {});
            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch (error) {
            console.error('Back to Main Error:', error.message);
        }
    });

    bot.action('help_menu', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.editMessageText(texts.getHelpText(), {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'back_to_main' }]]
                }
            }).catch(async () => {
                await ctx.deleteMessage().catch(() => {});
                await ctx.reply(texts.getHelpText(), {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'back_to_main' }]]
                    }
                });
            });
        } catch (error) { console.error(error.message); }
    });

    bot.action('shop_menu', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categories = await productRepo.getActiveCategories();
            const text = '🛍 *Shop*\n\nWähle eine Kategorie:';
            
            if (!categories || categories.length === 0) {
                const emptyText = '🛍 *Shop*\n\nDerzeit sind keine Produkte verfügbar.';
                const emptyKb = { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'back_to_main' }]] };
                return await ctx.editMessageText(emptyText, { parse_mode: 'Markdown', reply_markup: emptyKb })
                    .catch(() => ctx.reply(emptyText, { parse_mode: 'Markdown', reply_markup: emptyKb }));
            }

            const keyboard = categories.map(c => ([{ text: `📁 ${c.name}`, callback_data: `category_${c.id}` }]));
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'back_to_main' }]);

            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } })
                .catch(async () => {
                    await ctx.deleteMessage().catch(() => {});
                    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
                });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^category_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1];
            const subcats = await subcategoryRepo.getSubcategoriesByCategory(categoryId).catch(() => []);
            let keyboard = [];
            const text = 'Wähle eine Option:';

            if (subcats.length > 0) {
                subcats.forEach(sc => keyboard.push([{ text: `📂 ${sc.name}`, callback_data: `subcategory_${sc.id}` }]));
                const uncategorized = await productRepo.getProductsByCategory(categoryId, false);
                const noSubcatProducts = uncategorized.filter(p => !p.subcategory_id);
                noSubcatProducts.forEach(p => {
                    let label = p.is_out_of_stock ? `❌ ${p.name}` : p.name;
                    keyboard.push([{ text: `${label} – ${formatters.formatPrice(p.price)}`, callback_data: `product_${p.id}` }]);
                });
            } else {
                const products = await productRepo.getProductsByCategory(categoryId, false);
                if (!products || products.length === 0) {
                    const emptyText = 'Diese Kategorie ist aktuell leer.';
                    const emptyKb = { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'shop_menu' }]] };
                    return await ctx.editMessageText(emptyText, { reply_markup: emptyKb })
                        .catch(() => ctx.reply(emptyText, { reply_markup: emptyKb }));
                }
                products.forEach(p => {
                    let label = p.is_out_of_stock ? `❌ ${p.name}` : p.name;
                    keyboard.push([{ text: `${label} – ${formatters.formatPrice(p.price)}`, callback_data: `product_${p.id}` }]);
                });
            }
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'shop_menu' }]);
            
            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } })
                .catch(async () => {
                    await ctx.deleteMessage().catch(() => {});
                    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
                });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^subcategory_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const subcatId = ctx.match[1];
            const subcat = await subcategoryRepo.getSubcategoryById(subcatId);
            const products = await productRepo.getProductsBySubcategory(subcatId, false);
            const backCb = subcat ? `category_${subcat.category_id}` : 'shop_menu';

            if (!products || products.length === 0) {
                const emptyText = 'Keine Produkte verfügbar.';
                const emptyKb = { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: backCb }]] };
                return await ctx.editMessageText(emptyText, { reply_markup: emptyKb })
                    .catch(() => ctx.reply(emptyText, { reply_markup: emptyKb }));
            }

            const keyboard = products.map(p => {
                let label = p.is_out_of_stock ? `❌ ${p.name}` : p.name;
                return [{ text: `${label} – ${formatters.formatPrice(p.price)}`, callback_data: `product_${p.id}` }];
            });
            keyboard.push([{ text: '🔙 Zurück', callback_data: backCb }]);
            
            const title = `📂 *${subcat ? subcat.name : ''}*`;
            await ctx.editMessageText(title, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } })
                .catch(async () => {
                    await ctx.deleteMessage().catch(() => {});
                    await ctx.reply(title, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
                });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^product_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            if (!product) return;

            let path = '';
            try {
                if (product.category_id) {
                    const categories = await productRepo.getActiveCategories();
                    const cat = categories.find(c => String(c.id) === String(product.category_id));
                    path = cat ? cat.name : '';
                    if (product.subcategory_id) {
                        const subcat = await subcategoryRepo.getSubcategoryById(product.subcategory_id);
                        if (subcat) path += ` » ${subcat.name}`;
                    }
                }
            } catch (e) {}

            let text = `*${product.name}*\n`;
            if (path) text += `_In: ${path}_\n`;
            text += `\n💰 ${formatters.formatPrice(product.price)}`;
            if (product.description) text += `\n\n📝 ${product.description}`;
            
            const backCb = product.subcategory_id 
                ? `subcategory_${product.subcategory_id}` 
                : (product.category_id ? `category_${product.category_id}` : 'shop_menu');
            
            const keyboard = { inline_keyboard: [] };
            if (!product.is_out_of_stock) {
                keyboard.inline_keyboard.push([{ text: '🛒 In den Warenkorb', callback_data: `add_to_cart_${product.id}` }]);
            } else {
                keyboard.inline_keyboard.push([{ text: '❌ Ausverkauft', callback_data: 'noop' }]);
            }
            keyboard.inline_keyboard.push([{ text: '🔙 Zurück', callback_data: backCb }]);

            const hasMedia = ctx.callbackQuery && ctx.callbackQuery.message && (ctx.callbackQuery.message.photo || ctx.callbackQuery.message.animation);

            if (product.image_url) {
                if (hasMedia) {
                    await ctx.editMessageCaption(text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(async () => {
                        await ctx.deleteMessage().catch(() => {});
                        await ctx.replyWithPhoto(product.image_url, { caption: text, parse_mode: 'Markdown', reply_markup: keyboard }).catch(async () => {
                            await ctx.reply(text + '\n\n⚠️ _Bild konnte nicht geladen werden_', { parse_mode: 'Markdown', reply_markup: keyboard });
                        });
                    });
                } else {
                    await ctx.deleteMessage().catch(() => {});
                    await ctx.replyWithPhoto(product.image_url, { caption: text, parse_mode: 'Markdown', reply_markup: keyboard })
                        .catch(async () => {
                            await ctx.reply(text + '\n\n⚠️ _Bild konnte nicht geladen werden_', { parse_mode: 'Markdown', reply_markup: keyboard });
                        });
                }
            } else {
                if (hasMedia) {
                    await ctx.deleteMessage().catch(() => {});
                    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
                } else {
                    await uiHelper.updateOrSend(ctx, text, keyboard);
                }
            }
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^add_to_cart_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            let path = '';
            
            if (product) {
                try {
                    const categories = await productRepo.getActiveCategories();
                    const cat = categories.find(c => String(c.id) === String(product.category_id));
                    path = cat ? cat.name : '';
                    
                    if (product.subcategory_id) {
                        const subcat = await subcategoryRepo.getSubcategoryById(product.subcategory_id);
                        if (subcat) path += ` » ${subcat.name}`;
                    }
                } catch (e) {}
            }
            
            await ctx.scene.enter('askQuantityScene', { productId: ctx.match[1], categoryPath: path }); 
        } 
        catch (error) { console.error(error.message); }
    });

    bot.action('admin_info', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        await ctx.editMessageText(texts.getAdminInfoText(), { 
            parse_mode: 'Markdown', 
            reply_markup: adminKeyboards.getBackToAdminPanel()
        }).catch(() => ctx.reply(texts.getAdminInfoText(), { 
            parse_mode: 'Markdown', 
            reply_markup: adminKeyboards.getBackToAdminPanel()
        }));
    });

    bot.action('master_info', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        await ctx.editMessageText(texts.getMasterInfoText(), { 
            parse_mode: 'Markdown', 
            reply_markup: { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_panel' }]] } 
        }).catch(() => ctx.reply(texts.getMasterInfoText(), { 
            parse_mode: 'Markdown', 
            reply_markup: { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_panel' }]] } 
        }));
    });

    bot.action('noop', async (ctx) => {
        ctx.answerCbQuery('Dieses Produkt ist leider nicht verfügbar.').catch(() => {});
    });
};
