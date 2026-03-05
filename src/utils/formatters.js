const escapeMarkdown = (text) => {
    if (!text) return '';
    return String(text).replace(/([_*`\[\]])/g, '\\$1');
};

const formatPrice = (amount) => {
    const num = parseFloat(amount);
    if (isNaN(num)) return '0,00 €';
    return num.toFixed(2).replace('.', ',') + ' €';
};

const formatInvoice = (items, total, paymentMethod, orderId = null) => {
    let text = '📦 *Bestellübersicht*\n';
    
    if (orderId) {
        text += `🆔 *Bestellung:* #${escapeMarkdown(orderId)}\n`;
    }
    
    text += '\n';

    items.forEach(item => {
        // UPDATE: Kategorie-Pfad und Produktname werden vor dem Einfügen entschärft!
        const safePath = item.category_path ? escapeMarkdown(item.category_path) : '';
        const pathString = safePath ? `_${safePath}_ » ` : ''; 
        const safeName = escapeMarkdown(item.name);
        
        text += `▪️ ${item.quantity}x ${pathString}${safeName} (${formatPrice(item.price)}) = ${formatPrice(item.total)}\n`;
    });

    text += `\n━━━━━━━━━━━━━━━\n`;
    text += `💰 *Gesamtsumme: ${formatPrice(total)}*\n`;
    
    // UPDATE: Auch der Name der Zahlungsart wird entschärft
    const safePaymentName = escapeMarkdown(paymentMethod.name);
    text += `💳 *Zahlung:* ${safePaymentName}\n`;

    if (paymentMethod.wallet_address) {
        // Wallet-Adressen stehen in einem Code-Block (`), die müssen so bleiben wie sie sind.
        text += `\n📋 *Zahlungsadresse:*\n\`${paymentMethod.wallet_address}\`\n_(Tippe zum Kopieren)_\n`;
    }

    if (paymentMethod.description) {
        // UPDATE: Beschreibung der Zahlungsart entschärfen
        const safeDesc = escapeMarkdown(paymentMethod.description);
        text += `\n📝 *Hinweis:* _${safeDesc}_\n`;
    }

    return text;
};

const formatDate = (dateString) => {
    const date = new Date(dateString);
    
    if (isNaN(date.getTime())) {
        return new Date().toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

module.exports = {
    escapeMarkdown,
    formatPrice,
    formatInvoice,
    formatDate
};
