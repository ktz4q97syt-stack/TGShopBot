const productRepo = require('../../database/repositories/productRepo');
const subcategoryRepo = require('../../database/repositories/subcategoryRepo');
const uiHelper = require('../../utils/uiHelper');
const { isAdmin } = require('../middlewares/auth');
const texts = require('../../utils/texts');
const adminKeyboards = require('../keyboards/adminKeyboards');

module.exports = (bot) => {
    bot.action('admin_manage_categories', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categories = await productRepo.getActiveCategories();
            const keyboard = adminKeyboards.getManageCategoriesMenu(categories);
            await uiHelper.updateOrSend(ctx, texts.getAdminCategoryManageHeader(), keyboard);
        } catch (error) {}
    });

    bot.action('admin_add_category', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { 
            await ctx.scene.enter('addCategoryScene'); 
        } catch (error) {}
    });

    bot.action(/^admin_edit_cat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1];
            const categories = await productRepo.getActiveCategories();
            const category = categories.find(c => c.id == categoryId);
            if (!category) return;
            const subcats = await subcategoryRepo.getSubcategoriesByCategory(categoryId).catch(() => []);
            
            const keyboard = adminKeyboards.getEditCategoryMenu(categoryId, subcats);
            const text = texts.getAdminCategoryDetails(category.name, subcats.length);
            
            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) {}
    });

    bot.action(/^admin_sort_cat_(up|down)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const direction = ctx.match[1];
            const id = ctx.match[2];
            const categories = await productRepo.getActiveCategories();
            const index = categories.findIndex(c => c.id == id);
            if ((direction === 'up' && index > 0) || (direction === 'down' && index < categories.length - 1)) {
                const swapIndex = direction === 'up' ? index - 1 : index + 1;
                await Promise.all(categories.map((cat, i) => {
                    let newOrder = i;
                    if (i === index) newOrder = swapIndex;
                    else if (i === swapIndex) newOrder = index;
                    return productRepo.updateCategorySortOrder(cat.id, newOrder);
                }));
                ctx.answerCbQuery('✅').catch(() => {});
            } else {
                ctx.answerCbQuery('Nicht möglich.').catch(() => {});
            }
            ctx.update.callback_query.data = `admin_edit_cat_${id}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) {}
    });

    bot.action(/^admin_rename_cat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { 
            await ctx.scene.enter('renameCategoryScene', { categoryId: ctx.match[1] }); 
        } catch (error) {}
    });

    bot.action(/^admin_del_cat_(.+)$/, isAdmin, async (ctx) => {
        try {
            await productRepo.deleteCategory(ctx.match[1]);
            ctx.answerCbQuery('✅ Gelöscht.').catch(() => {});
            ctx.update.callback_query.data = 'admin_manage_categories';
            return bot.handleUpdate(ctx.update);
        } catch (error) {}
    });

    bot.action(/^admin_add_subcat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1];
            const categories = await productRepo.getActiveCategories();
            const cat = categories.find(c => c.id == categoryId);
            await ctx.scene.enter('addSubcategoryScene', { categoryId, categoryName: cat ? cat.name : 'Unbekannt' });
        } catch (error) {}
    });

    bot.action(/^admin_edit_subcat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const subcat = await subcategoryRepo.getSubcategoryById(ctx.match[1]);
            if (!subcat) return;
            
            const keyboard = adminKeyboards.getEditSubcategoryMenu(subcat);
            await uiHelper.updateOrSend(ctx, texts.getAdminSubcategoryDetails(subcat.name), keyboard);
        } catch (error) {}
    });

    bot.action(/^admin_sort_subcat_(up|down)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const direction = ctx.match[1];
            const id = ctx.match[2];
            const subcat = await subcategoryRepo.getSubcategoryById(id);
            if (!subcat) return;

            const subcats = await subcategoryRepo.getSubcategoriesByCategory(subcat.category_id);
            const index = subcats.findIndex(sc => sc.id == id);

            if ((direction === 'up' && index > 0) || (direction === 'down' && index < subcats.length - 1)) {
                const swapIndex = direction === 'up' ? index - 1 : index + 1;
                await Promise.all(subcats.map((sc, i) => {
                    let newOrder = i;
                    if (i === index) newOrder = swapIndex;
                    else if (i === swapIndex) newOrder = index;
                    return subcategoryRepo.updateSubcategorySortOrder(sc.id, newOrder);
                }));
                ctx.answerCbQuery('✅').catch(() => {});
            } else {
                ctx.answerCbQuery('Nicht möglich.').catch(() => {});
            }
            
            ctx.update.callback_query.data = `admin_edit_subcat_${id}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) {}
    });

    bot.action(/^admin_rename_subcat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { 
            await ctx.scene.enter('renameSubcategoryScene', { subcategoryId: ctx.match[1] }); 
        } catch (error) {}
    });

    bot.action(/^admin_del_subcat_(.+)$/, isAdmin, async (ctx) => {
        try {
            const subcat = await subcategoryRepo.getSubcategoryById(ctx.match[1]);
            await subcategoryRepo.deleteSubcategory(ctx.match[1]);
            ctx.answerCbQuery('✅ Gelöscht.').catch(() => {});
            if (subcat) {
                ctx.update.callback_query.data = `admin_edit_cat_${subcat.category_id}`;
                return bot.handleUpdate(ctx.update);
            }
        } catch (error) {}
    });
};
