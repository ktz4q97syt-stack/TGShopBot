const productRepo = require('../../database/repositories/productRepo');
const subcategoryRepo = require('../../database/repositories/subcategoryRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const uiHelper = require('../../utils/uiHelper');
const { isAdmin } = require('../middlewares/auth');
const formatters = require('../../utils/formatters');
const config = require('../../config');
const texts = require('../../utils/texts');
const adminKeyboards = require('../keyboards/adminKeyboards');

module.exports = (bot) => {
    bot.action('admin_manage_products', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categories = await productRepo.getActiveCategories();
            const keyboard = adminKeyboards.getManageProductsMenu(categories);
            await uiHelper.updateOrSend(ctx, texts.getAdminProductManageHeader(), keyboard);
        } catch (error) {}
    });

    bot.action(/^admin_prod_cat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1] === 'none' ? null : ctx.match[1];
            
            let subcats = [];
            if (categoryId !== null) {
                subcats = await subcategoryRepo.getSubcategoriesByCategory(categoryId).catch(() => []);
            }

            const allProducts = await productRepo.getProductsByCategory(categoryId, true);
            const directProducts = categoryId === null ? allProducts : allProducts.filter(p => !p.subcategory_id);

            const keyboard = adminKeyboards.getProductCategoryMenu(categoryId, subcats, directProducts);
            await uiHelper.updateOrSend(ctx, texts.getAdminProductSelectSubcat(), keyboard);
        } catch (error) {}
    });

    bot.action(/^admin_prod_subcat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const subcatId = ctx.match[1];
            const subcat = await subcategoryRepo.getSubcategoryById(subcatId);
            const products = await productRepo.getProductsBySubcategory(subcatId, true);

            const keyboard = adminKeyboards.getProductSubcategoryMenu(subcat, products);
            await uiHelper.updateOrSend(ctx, texts.getAdminProductSubcatHeader(subcat ? subcat.name : 'Unterkategorie'), keyboard);
        } catch (error) {}
    });

    bot.action(/^admin_add_prod_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const catId = ctx.match[1] === 'none' ? null : ctx.match[1];
            await ctx.scene.enter('addProductScene', { categoryId: catId });
        } catch (error) {}
    });

    bot.action(/^admin_edit_prod_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            if (!product) return;
            
            let path = 'Kategorielos';
            try {
                if (product.category_id) {
                    const categories = await productRepo.getActiveCategories();
                    const cat = categories.find(c => String(c.id) === String(product.category_id));
                    path = cat ? cat.name : 'Unbekannt';

                    if (product.subcategory_id) {
                        const subcat = await subcategoryRepo.getSubcategoryById(product.subcategory_id);
                        if (subcat) path += ` » ${subcat.name}`;
                    }
                }
            } catch (e) {}

            const deliveryOpt = product.delivery_option || 'none';
            const deliveryLabel = texts.getDeliveryLabel(deliveryOpt);
            
            const text = texts.getAdminProductDetails(product, path, deliveryLabel, formatters.formatPrice(product.price));
            
            const backCb = product.subcategory_id 
                ? `admin_prod_subcat_${product.subcategory_id}` 
                : (product.category_id ? `admin_prod_cat_${product.category_id}` : 'admin_prod_cat_none');

            const keyboard = adminKeyboards.getEditProductMenu(product, deliveryLabel, backCb);

            await uiHelper.sendProductMedia(ctx, product.image_url, text, keyboard);

        } catch (error) {}
    });

    bot.action(/^admin_cycle_delivery_(.+)$/, isAdmin, async (ctx) => {
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            if (!product) return ctx.answerCbQuery('Produkt nicht gefunden.', { show_alert: true });
            const cycle = ['none', 'shipping', 'pickup', 'both'];
            const currentIndex = cycle.indexOf(product.delivery_option || 'none');
            const nextOption = cycle[(currentIndex + 1) % cycle.length];
            await productRepo.setDeliveryOption(product.id, nextOption);
            ctx.answerCbQuery(`Lieferoption: ${texts.getDeliveryLabel(nextOption)}`).catch(() => {});
            ctx.update.callback_query.data = `admin_edit_prod_${product.id}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) {}
    });

    bot.action(/^admin_toggle_active_(.+)$/, isAdmin, async (ctx) => {
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            if (!product) return;
            await productRepo.toggleProductStatus(product.id, 'is_active', !product.is_active);
            ctx.answerCbQuery(product.is_active ? '👻 Deaktiviert' : '✅ Aktiviert').catch(() => {});
            ctx.update.callback_query.data = `admin_edit_prod_${product.id}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) {}
    });

    bot.action(/^admin_toggle_stock_(.+)$/, isAdmin, async (ctx) => {
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            if (!product) return;
            await productRepo.toggleProductStatus(product.id, 'is_out_of_stock', !product.is_out_of_stock);
            ctx.answerCbQuery(product.is_out_of_stock ? '📦 Verfügbar' : '❌ Ausverkauft').catch(() => {});
            ctx.update.callback_query.data = `admin_edit_prod_${product.id}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) {}
    });

    bot.action(/^admin_price_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const isMaster = ctx.from.id === Number(config.MASTER_ADMIN_ID);
            if (isMaster) {
                await ctx.scene.enter('editPriceScene', { productId: ctx.match[1] });
            } else {
                ctx.session.pendingPriceProduct = ctx.match[1];
                const keyboard = adminKeyboards.getCancelBackToProduct(ctx.match[1]);
                await uiHelper.updateOrSend(ctx, texts.getAdminPricePrompt(), keyboard);
            }
        } catch (error) {}
    });

    bot.action(/^admin_rename_prod_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { 
            await ctx.scene.enter('renameProductScene', { productId: ctx.match[1] }); 
        } catch (error) {}
    });

    bot.action(/^admin_img_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { 
            await ctx.scene.enter('editProductImageScene', { productId: ctx.match[1] }); 
        } catch (error) {}
    });

    bot.action(/^admin_sort_prod_(up|down)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const direction = ctx.match[1];
            const prodId = ctx.match[2];
            const product = await productRepo.getProductById(prodId);
            if (!product) return;
            
            let products;
            if (product.subcategory_id) {
                products = await productRepo.getProductsBySubcategory(product.subcategory_id, true);
            } else {
                const allCatProducts = await productRepo.getProductsByCategory(product.category_id, true);
                products = allCatProducts.filter(p => !p.subcategory_id);
            }

            const index = products.findIndex(p => p.id == prodId);
            if ((direction === 'up' && index > 0) || (direction === 'down' && index < products.length - 1)) {
                const swapIndex = direction === 'up' ? index - 1 : index + 1;
                await Promise.all(products.map((p, i) => {
                    let newOrder = i;
                    if (i === index) newOrder = swapIndex;
                    else if (i === swapIndex) newOrder = index;
                    return productRepo.updateProductSortOrder(p.id, newOrder);
                }));
                ctx.answerCbQuery('✅').catch(() => {});
            } else {
                ctx.answerCbQuery('Nicht möglich.').catch(() => {});
            }
            ctx.update.callback_query.data = `admin_edit_prod_${prodId}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) {}
    });

    bot.action(/^admin_del_prod_(.+)$/, isAdmin, async (ctx) => {
        try {
            const isMaster = ctx.from.id === Number(config.MASTER_ADMIN_ID);
            const product = await productRepo.getProductById(ctx.match[1]);
            
            const backCb = product && product.subcategory_id 
                ? `admin_prod_subcat_${product.subcategory_id}` 
                : (product && product.category_id ? `admin_prod_cat_${product.category_id}` : 'admin_prod_cat_none');

            if (isMaster) {
                await productRepo.deleteProduct(ctx.match[1]);
                ctx.answerCbQuery('🗑 Gelöscht.').catch(() => {});
                ctx.update.callback_query.data = backCb;
                return bot.handleUpdate(ctx.update);
            } else {
                const adminName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
                await approvalRepo.createApproval(ctx.match[1], 'DELETE', null, adminName);
                ctx.answerCbQuery('Löschanfrage gesendet.').catch(() => {});
                await uiHelper.updateOrSend(ctx, texts.getAdminDeleteRequestSent(product.name || 'Produkt'), {
                    inline_keyboard: [[{ text: '🔙 Zurück', callback_data: backCb }]]
                });
            }
        } catch (error) {}
    });
};
